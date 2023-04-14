import GetPatient from "../helpers/dbConnect";

export default class UpdateStatus {
    public async updateStatus(params: any) {
        let dataToBeUpdated = new GetPatient();
        const updateStatus = await dataToBeUpdated.updateEidCsvMetaData(params);
        if (updateStatus.affectedRows > 0) {
            return updateStatus;
        }
    }

    public async updateExistingData(params: any) {
        let dataToBeUpdated =  new GetPatient()
        const updateRecords = await dataToBeUpdated.updateExistingData(params);
        if(updateRecords.affectedRows > 0) {
            return updateRecords
        }
    }
}