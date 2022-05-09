import config from "@amrs-integrations/core"

export async function getPatient(uuid: string) {
    let CM = config.ConnectionManager.getInstance();
    let amrsCON = await CM.getConnectionAmrs();
    let sql = `select t1.uuid,
    null as ClientNumber,
    case when t5.given_name is not null then UPPER(t5.given_name)
         when t5.middle_name is not null then UPPER(t5.middle_name)
         else UPPER(t5.family_name)
    end as FirstName,
    UPPER(t5.middle_name) as MiddleName,
    case when t5.family_name is not null then UPPER(t5.family_name)
         when t5.middle_name is not null then UPPER(t5.middle_name)
         else UPPER(t5.given_name)
    end as LastName,
    t1.birthdate as DateOfBirth,
    null as MaritalStatus,
    t1.gender as Gender,
    UPPER(cno.name) as Occupation,
    null as Religion,
    UPPER(cne.name) as EducationLevel,
    null as Country,
    null as CountryOfBirth,
    UPPER(t8.address1) as County,
    UPPER(t8.address2) as SubCounty,
    null as Ward,
    UPPER(t8.address3) as Village,
    null as LandMark,
    null as Address,
    t6.value AS PrimaryPhone,
    t7.value AS SecondaryPhone,
    null as EmailAddress,
    UPPER(pak.value) as Name,
    UPPER(pakr.value) as Relationship,
    null as Residence,
    case when pakp.value is not null then pakp.value else pakt.value end as PrimaryPhoneKin,
    null as SecondaryPhoneKin,
    null as EmailAddressKin,
    null as OriginFacilityKmflCode,
    case when t1.death_date is null then 'Yes'
         when t1.death_date is not null then 'No'
    else null end as IsAlive
    from  amrs.person t1 
    left join amrs.patient_identifier t2 on (t1.person_id = t2.patient_id and t2.identifier_type = 28 and t2.voided = 0)
    left join amrs.patient_identifier t3 on (t1.person_id = t3.patient_id and t3.identifier_type = 5 and t3.voided = 0)
    left join amrs.patient_identifier t4 on (t1.person_id = t4.patient_id and t4.identifier_type = 3 and t4.voided = 0)
    left join amrs.person_name t5 on (t5.person_id = t1.person_id and t5.voided = 0)
    left join amrs.person_attribute t6 ON (t1.person_id = t6.person_id AND t6.voided = 0 AND t6.person_attribute_type_id IN (10))
    left join amrs.person_attribute t7 ON (t1.person_id = t7.person_id AND t7.voided = 0 AND t7.person_attribute_type_id IN (40))
    left join amrs.person_address t8 on (t1.person_id = t8.person_id and t8.voided = 0)
    left join amrs.person_attribute pao on (pao.person_id = t1.person_id and pao.person_attribute_type_id = 42 and pao.voided = 0)
    left join amrs.concept_name cno on (cno.concept_id = pao.value and cno.voided = 0)
    left join amrs.person_attribute pae on (pae.person_id = t1.person_id and pae.person_attribute_type_id = 73 and pae.voided = 0)
    left join amrs.concept_name cne on (cne.concept_id = pae.value and cne.voided = 0)
    left join amrs.person_attribute pasp on (pasp.person_id = t1.person_id and pasp.person_attribute_type_id = 23 and pasp.voided = 0)
    left join amrs.person_attribute pak on (pak.person_id = t1.person_id and pak.person_attribute_type_id = 69 and pak.voided = 0)
    left join amrs.person_attribute pakr on (pakr.person_id = t1.person_id and pakr.person_attribute_type_id = 70 and pakr.voided = 0)
    left join amrs.person_attribute pakt on (pakt.person_id = t1.person_id and pakt.person_attribute_type_id = 25 and pakt.voided = 0)
    left join amrs.person_attribute pakp on (pakp.person_id = t1.person_id and pakp.person_attribute_type_id = 71 and pakp.voided = 0)
    where t1.uuid = '${uuid}' group by t1.person_id`

    const result = await CM.query(sql, amrsCON);

    return result[0];
}