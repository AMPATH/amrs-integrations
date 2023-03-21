import GetPatient from "../helpers/dbConnect";

export default class VoidCsvData {
  public async voidCsvData(params: any) {
    let dataToBeRetrieved = new GetPatient();
    const voidCsvData = await dataToBeRetrieved.voidEidCsvMetaData(params);
    if (voidCsvData.affectedRows > 0) {
        return voidCsvData;
    }
  }
}