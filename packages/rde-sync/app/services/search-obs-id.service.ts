import { AMRS_POOL } from "../db";


class SearchObsWithID {
    async searchObsWithID(id: number) {
        const query = `
        SELECT obs.obs_id, obs.uuid, obs.obs_datetime, location.name, obs.value_coded, obs.voided_by
        FROM obs
        LEFT JOIN location ON obs.location_id = location.location_id
        WHERE obs.obs_id = ${id}
      `;
    const connection = await AMRS_POOL.getConnection();
    const result = await connection.execute(query);
    connection.release();
    const [row] = result;
    return row;
    }
}

export default SearchObsWithID;
