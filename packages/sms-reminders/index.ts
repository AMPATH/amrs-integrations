import { RetrieveAppointments, SendNotifications } from "./app/appointments";
import config from "@amrs-integrations/core"
import {setConfiguration} from "redis-smq"
import { SendSMS, UpdateDelivery } from "./app/sms";
let redisConfig:any =config.redis
setConfiguration(redisConfig)
//Run producer and consumer
let args = process.argv;
switch (args[2]) {
    case 'produce':
        // Week before, a day before,morning of appointment, 24hrs after missing/honouring appointment
        // All people who honoured appointments get congratulatory messages after 1hr
        // Monitoring delivery reports and replies from shortcode. 
        // Morning meessage to go at 6 for all appointments client
        // Every one who has consented gets a welcome message immediately
        RetrieveAppointments(args[3],"",args[4])
        // Every one who has consented gets a welcome message.
        // Send to completed visits
        break;
    case 'consume':
        SendNotifications();
        break;
    case 'test':
        SendSMS('{"rtc_date":"2022-09-10","phone_number":"'+args[3]+'","language":"english","messageType":"congratulations","person_name":"Rono","person_id":"12345"}');
        break;
    case 'update_delivery':
        UpdateDelivery();
        break;
    default:
        console.log("please specify the command to run e.g node index.js produce 4")
        break;
}