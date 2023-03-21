import GetPatient from '../helpers/dbConnect'
export default class GetCsvFileMetadata {
    public async getCsvData(params: string, pageNumber: number, pageSize: number) {
        let dataToBeRetrieved = new GetPatient()
        const csvMetaData = await dataToBeRetrieved.getEidCsvMetaData(params, pageNumber, pageSize)
        if(csvMetaData.length > 0) {
            return csvMetaData
        }else {
            return 'No result found'
        }
    }
}