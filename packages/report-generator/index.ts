import * as XLSX from 'xlsx';
import * as fs from 'fs';

interface RowData {
  row: number;
  columns: { columnLetter: string; value: any }[];
}

interface SheetData {
  sheetName: string;
  rows: RowData[];
}

// Read the JSON file
const jsonData =`{
    "sheetName": "Sheet2",
    "rows": [
      {
        "row": 1,
        "columns": [
          {
            "columnLetter": "A",
            "value": "Value angowa"
          },
          {
            "columnLetter": "B",
            "value": "Value2"
          }
        ]
      },
      {
        "row": 2,
        "columns": [
          {
            "columnLetter": "C",
            "value": "Value3"
          },
          {
            "columnLetter": "D",
            "value": "Value4"
          }
        ]
      },
      {
        "row": 3,
        "columns": [
          {
            "columnLetter": "E",
            "value": "Value5"
          },
          {
            "columnLetter": "F",
            "value": "Value6"
          }
        ]
      }
    ]
  }`;
  const data: SheetData = JSON.parse(jsonData);
// Create a new workbook

// Create a new workbook
const workbook = XLSX.utils.book_new();

// Create a worksheet
const worksheet = XLSX.utils.aoa_to_sheet([]);

let maxColumnIndex = 0;

data.rows.forEach((row: RowData) => {
  const { row: rowNum, columns } = row;
  const rowData: any[] = [];

  columns.forEach((column) => {
    const { columnLetter, value } = column;
    const columnIndex = XLSX.utils.decode_col(columnLetter);
    rowData[columnIndex] = value;

    if (columnIndex > maxColumnIndex) {
      maxColumnIndex = columnIndex;
    }
  });
  // Remove empty values from the beginning of the rowData array
  let startIndex = rowData.findIndex((value) => value !== undefined);
  if (startIndex === -1) {
    startIndex = 0;
  }
  const trimmedRowData = rowData.slice(startIndex);
console.log(trimmedRowData)
  XLSX.utils.sheet_add_aoa(worksheet, [trimmedRowData], { origin: -1 });
});

// Add the worksheet to the workbook
XLSX.utils.book_append_sheet(workbook, worksheet, data.sheetName);

// Write the workbook to an XLSX file
XLSX.writeFile(workbook, 'output.xlsx');
console.log('Data successfully written to output.xlsx');