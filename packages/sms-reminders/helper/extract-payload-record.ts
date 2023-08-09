import config from '@amrs-integrations/core';
export const queryDB = async (person_id: number) => {
    let CM = config.ConnectionManager.getInstance();
    let amrsCON = await CM.getConnectionAmrs();
    const sql = `
    SELECT
	fh.person_id,
	mc.mfl_code AS RECEIVING_FACILITY,
	CONVERT(Now(),
	CHAR) AS MESSAGE_DATETIME,
	Max(CASE
               WHEN pi2.identifier_type = 3 THEN pi2.identifier
             end) AS EPI_IDENTIFIER_TYPE_ID,
	fpiv.ccc AS IPI_IDENTIFIER_TYPE_1_ID,
	fpiv.nupi AS IPI_IDENTIFIER_TYPE_2_ID,
	pn.given_name AS FIRST_NAME,
	pn.middle_name AS MIDDLE_NAME,
	pn.family_name AS LAST_NAME,
	Max(CASE
               WHEN pa2.person_attribute_type_id = 4 THEN pa2.value
             end) AS MOTHER_FIRST_NAME,
	convert(p.birthdate,
	char) AS DATE_OF_BIRTH,
	p.gender AS SEX,
	p.cause_of_death AS DEATH_INDICATOR,
	convert(date(p.death_date),
	char) AS DEATH_DATE,
	pa.city_village AS VILLAGE,
	pa.county_district AS SUB_COUNTY,
	pa.state_province AS COUNTY,
	pa.address1 AS POSTAL_ADDRESS,
	Max(CASE
               WHEN pa2.person_attribute_type_id = 31 THEN pa2.value
             end) AS LANDMARK,
	Max(CASE
               WHEN pa2.person_attribute_type_id = 10 THEN pa2.value
             end) AS PHONE_NUMBER,
	Max(CASE
               WHEN pa2.person_attribute_type_id = 5 THEN 'married'
             end) AS MARITAL_STATUS,
	Max(CASE
               WHEN ( ( pa.latitude != NULL )
                      AND ( pa.longitude != NULL ) ) THEN
               Concat(pa.latitude, ',', pa.longitude)
             end) AS GPS_LOCATION,
	Max(CASE
               WHEN p.birthdate_estimated = 0 THEN 'YES'
               ELSE 'NO'
             end) AS DATE_OF_BIRTH_PRECESION,
	Max(CASE
               WHEN pa2.person_attribute_type_id = 12 THEN pa2.value
             end) AS NOK_FIRST_NAME,
	Max(CASE
               WHEN pa2.person_attribute_type_id = 59 THEN pa2.value
             end) AS NOK_RELATIONSHIP,
	Max(CASE
               WHEN pa2.person_attribute_type_id = 75 THEN pa2.value
             end) AS NOK_ADDRESS,
	Max(CASE
               WHEN pa2.person_attribute_type_id = 25 THEN pa2.value
             end) AS NOK_PHONE_NUMBER,
	Max(CASE
               WHEN pa2.person_attribute_type_id = 27 THEN pa2.value
             end) AS NOK_SEX,
	Max(CASE
               WHEN pa2.person_attribute_type_id = 24 THEN (
               Date_sub(Date(Now()), INTERVAL CONVERT(pa2.value, signed) year) )
             end) AS NOK_DATE_OF_BIRTH,
	CONVERT(Date(fh.encounter_datetime),
	CHAR) AS VISIT_DATE,
	CONVERT(Date(fh.enrollment_date),
	CHAR) AS HIV_CARE_ENROLLMENT_DATE,
	CONVERT(Date(fh.rtc_date),
	CHAR) AS APPOINTMENT_DATE,
	CONVERT(Date(fh.arv_start_date),
	CHAR) AS ART_START,
	( CASE
		WHEN fh.transfer_in = 1 THEN 'TRANSFER IN'
		WHEN fh.transfer_out = 1 THEN 'TRANSFER OUT'
		ELSE 'RESIDENT'
	end ) AS PATIENT_SOURCE,
	convert(fh.encounter_id,
	char) AS PLACER_NUMBER,
	fh.cur_who_stage as CURRENT_WHO_STAGE,
	fh.weight as WEIGHT,
	fh.height AS HEIGHT,
	etl.get_arv_names(fh.cur_arv_meds) as REGIMEN,
	vt.systolic_bp,
	vt.diastolic_bp,
	vt.muac,
	convert(date(vl.test_datetime),char) as test_datetime,
	vl.hiv_viral_load
FROM
	amrs.person p
left JOIN amrs.person_name pn
                 ON
	( p.person_id = pn.person_id
		AND p.voided = 0
		AND pn.voided = 0 )
left JOIN amrs.person_address pa
                 ON
	pn.person_id = pa.person_id
	AND pa.voided = 0
left JOIN amrs.person_attribute pa2
                 ON
	pa.person_id = pa2.person_id
	AND pa2.voided = 0
left JOIN amrs.patient_identifier pi2
                 ON
	p.person_id = pi2.patient_id
	AND pi2.voided = 0
inner JOIN amrs.patient_identifier_type pit
                 ON
	pi2.identifier_type = pit.patient_identifier_type_id
left JOIN etl.flat_patient_identifiers_v1 fpiv
                 ON
	fpiv.patient_id = p.person_id
inner JOIN ndwr.mfl_codes mc
                 ON
	pi2.location_id = mc.location_id
inner JOIN etl.flat_hiv_summary_v15b fh
                 ON
	p.person_id = fh.person_id
	AND fh.is_clinical_encounter = 1
	AND fh.next_clinical_datetime_hiv IS NULL
	AND fh.person_id in (${person_id})
inner join (
	select
		fv.person_id,
		fv.muac,
		fv.systolic_bp,
		fv.diastolic_bp
	from
		etl.flat_vitals fv
	where
		fv.person_id in (${person_id})
			and fv.height is not null
			and fv.Weight is not null
			and fv.systolic_bp is not null
			and fv.diastolic_bp is not null
		order by
			fv.encounter_datetime desc
		limit 1) as vt on
	vt.person_id = fh.person_id
inner join (
	select
		flai.person_id,
		flai.test_datetime,
		flai.hiv_viral_load
	from
		etl.flat_labs_and_imaging flai
	where
		flai.person_id in (${person_id}) and  flai.hiv_viral_load is not null
	order by
		flai.encounter_id desc
	limit 1 ) as vl on
	fh.person_id = vl.person_id
group by
	fh.person_id;
    `;
    let result: any = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);

    return result;
}