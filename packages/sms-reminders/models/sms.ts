export interface AfricasTalkingResponse {
  SMSMessageData: SMSMessageData;
}

export interface SMSMessageData {
  Message: string;
  Recipients: Recipients;
}

export interface Recipients {
  Recipient: Recipient;
}

export interface Recipient {
  number: string;
  cost: string;
  status: string;
  statusCode: string;
  messageId: number;
}
