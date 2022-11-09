import config from "@amrs-integrations/core";

function getConnectionManager() {
  return config.ConnectionManager.getInstance();
}

export async function getFacilityMfl(param: string) {
  const CM = getConnectionManager();
  let amrsCON: any;
  const sql = `select mfl_code from amrs.location
  left join ndwr.mfl_codes using(location_id)
  where uuid = '${param}';`;
  return CM.getConnectionAmrs()
    .then((con) => {
      amrsCON = con;
      return CM.query(sql, amrsCON)
        .then((r) => r[0])
        .catch((err) => console.log("MFL Database Query Error ", err))
        .finally(() => CM.releaseConnections(amrsCON));
    })
    .catch((err) => {
      console.log("MFL Database Connection Error ", err);
    });
}

async function getPerson_id(uuid: string) {
  const CM = getConnectionManager();
  let amrsCON: any;
  const sql = `select * from amrs.person where uuid = '${uuid}';`;
  return CM.getConnectionAmrsProd()
    .then((con) => {
      amrsCON = con;
      return CM.query(sql, amrsCON)
        .then((r) => r[0])
        .catch((err) => console.log("Database Query Error ", err))
        .finally(() => CM.releaseConnections(amrsCON));
    })
    .catch((err) => {
      console.log("Database Connection Error at person_id", err);
    });
}

export async function getPatient(uuid: string) {
  const person_id = await getPerson_id(uuid);
  const personIdVal = person_id.person_id;
  const CM = getConnectionManager();
  let amrsCON: any;
  const sql = patientQuery(personIdVal, uuid);
  return CM.getConnectionAmrsProd()
    .then((con) => {
      amrsCON = con;
      return CM.query(sql, amrsCON)
        .then((r) => r[0])
        .catch((err) => console.log("Database Query Error ", err))
        .finally(() => CM.releaseConnections(amrsCON));
    })
    .catch((err) => {
      console.log("Database Connection Error ", err);
    });
}

function patientQuery(personIdVal: Number, uuid: string) {
  return `select t1.uuid,
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
  t1.gender as Gender,
  cno.name as Occupation,
  cnr.uuid as Religion,
  cne.uuid as EducationLevel,
  cnms.uuid as MaritalStatus,
  LOWER(t8.country) as Country,
  LOWER(t8.address10) as CountryOfBirth,
  LOWER(t8.address1) as County,
  LOWER(t8.address2) as SubCounty,
  LOWER(t8.address7) as Ward,
  t8.city_village as Village,
  t8.address3 as LandMark,
  t8.address8 as Address,
  t6.value AS PrimaryPhone,
  t7.value AS SecondaryPhone,
  te.value as EmailAddress,
  UPPER(pak.value) as Name,
  UPPER(pakr.value) as Relationship,
  case when pakp.value is not null then pakp.value else pakt.value end as PrimaryPhoneKin,
  null as SecondaryPhoneKin,
  null as EmailAddressKin,
  null as OriginFacilityKmflCode,
  case when t1.death_date is null then 'true'
      when t1.death_date is not null then 'false'
  else null end as IsAlive,
  case when t2.identifier is not null then t2.identifier else "" end as nascopCCCNumber
  from  amrs.person t1
  left join amrs.patient_identifier t2 on (t1.person_id = t2.patient_id and t2.identifier_type = 28 and t2.voided = 0)
  left join amrs.patient_identifier t3 on (t1.person_id = t3.patient_id and t3.identifier_type = 5 and t3.voided = 0)
  left join amrs.patient_identifier t4 on (t1.person_id = t4.patient_id and t4.identifier_type = 3 and t4.voided = 0)
  left join amrs.person_name t5 on (t5.person_id = t1.person_id and t5.voided = 0)
  left join amrs.person_attribute t6 ON (t1.person_id = t6.person_id AND t6.voided = 0 AND t6.person_attribute_type_id IN (10))
  left join amrs.person_attribute t7 ON (t1.person_id = t7.person_id AND t7.voided = 0 AND t7.person_attribute_type_id IN (40))
  left join amrs.person_attribute te ON (t1.person_id = te.person_id AND te.voided = 0 AND te.person_attribute_type_id IN (60))
  left join (select * from amrs.person_address where person_id = ${personIdVal} order by date_created desc limit 1 ) t8 on (t1.person_id = t8.person_id and t8.voided = 0)
  left join amrs.person_attribute pao on (pao.person_id = t1.person_id and pao.person_attribute_type_id = 42 and pao.voided = 0) #occupation
  left join amrs.concept_name cno on (cno.concept_id = pao.value and cno.voided = 0)
  left join amrs.person_attribute par on (par.person_id = t1.person_id and par.person_attribute_type_id = 49 and par.voided = 0) #religion
  left join amrs.concept cnr on (cnr.concept_id = par.value and cnr.retired = 0)
  left join amrs.person_attribute pams on (pams.person_id = t1.person_id and pams.person_attribute_type_id = 5 and pams.voided = 0) #marital status
  left join amrs.concept cnms on (cnms.concept_id = pams.value and cnms.retired = 0)
  left join amrs.person_attribute pae on (pae.person_id = t1.person_id and pae.person_attribute_type_id = 73 and pae.voided = 0) #highest education
  left join amrs.concept cne on (cne.concept_id = pae.value and cne.retired = 0)
  left join amrs.person_attribute pasp on (pasp.person_id = t1.person_id and pasp.person_attribute_type_id = 23 and pasp.voided = 0) #partner phone
  left join amrs.person_attribute pak on (pak.person_id = t1.person_id and pak.person_attribute_type_id = 69 and pak.voided = 0) #caregiver name
  left join amrs.person_attribute pakr on (pakr.person_id = t1.person_id and pakr.person_attribute_type_id = 70 and pakr.voided = 0) #relationship
  left join amrs.person_attribute pakt on (pakt.person_id = t1.person_id and pakt.person_attribute_type_id = 25 and pakt.voided = 0) #Kin phone
  left join amrs.person_attribute pakp on (pakp.person_id = t1.person_id and pakp.person_attribute_type_id = 71 and pakp.voided = 0)
    where t1.uuid = '${uuid}' group by t1.person_id`;
}

export async function getBatchUpdateData() {
  const CM = getConnectionManager();
  let amrsCON: any;
  const sql = `SELECT 
          id.identifier, cc.identifier as ccc
          FROM
          amrs.patient_identifier id
              inner JOIN
          amrs.patient_identifier cc ON (id.patient_id = cc.patient_id
              AND cc.identifier_type = 28
              AND cc.voided = 0)
          WHERE
          id.identifier_type = 45
              AND id.voided = 0
              AND cc.identifier IS NOT NULL AND cc.location_id = 1
              GROUP BY id.identifier`;
  return CM.getConnectionAmrs()
    .then((con) => {
      amrsCON = con;
      return CM.query(sql, amrsCON)
        .then((r) => r)
        .catch((err) => console.log("Batch Update Query Error ", err))
        .finally(() => CM.releaseConnections(amrsCON));
    })
    .catch((err) => {
      console.log("Batch Update Db Connection Error ", err);
    });
}
