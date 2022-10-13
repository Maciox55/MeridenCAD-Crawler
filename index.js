const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const cron = require('node-cron');
const Call = require('./Call');
const dotenv = require('dotenv');
var moment = require('moment');
// const request = require('request');
const request = require("request-promise");
dotenv.config();

const {Client} = require("@googlemaps/google-maps-services-js");
const client = new Client({});


mongoose.connect(process.env.CONNSTRING);



const activeCallsRequest = {
    method: 'GET',
    url: 'http://www.meridenp2c.com/cad/cadHandler.ashx',
    qs: {op: 's'},
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      Connection: 'keep-alive',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: 'http://www.meridenp2c.com/cad/currentcalls.aspx',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    },
    form: {
      t: 'ccc',
      _search: 'false',
      rows: '1000',
      page: '1',
      sidx: 'starttime',
      sord: 'desc'
    }
  };

  const closedCallsRequest = {
    method: 'GET',
    url: 'http://www.meridenp2c.com/cad/cadHandler.ashx',
    qs: {op: 's'},
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: 'http://www.meridenp2c.com',
      Referer: 'http://www.meridenp2c.com/cad/callsnapshot.aspx',
      'X-Requested-With': 'XMLHttpRequest'
    },
    form: {
      t: 'css',
      _search: 'false',
      rows: '1000',
      page: '1',
      sidx: 'starttime',
      sord: 'desc'
    }
  };
  


async function crawl() {
  
    // const browser = await puppeteer.launch({ headless: true, muteAudio: true });

    // const page = await browser.newPage();


    let activeCalls = await getCADCalls();
    let closedCalls = await getClosedCalls();
    console.log("ACTIVE CALLS ");
    let parsedActive = JSON.parse(activeCalls);
    let parsedClosed = JSON.parse(closedCalls)
    // console.log(parsedClosed.rows);


   
        for (var i = 0; i < parsedActive.rows.length; i++) {
            // console.log(activeCalls[i]);
            let c = {
                                agency: parsedActive.rows[i].agency,
                                service: parsedActive.rows[i].service,
                                case: parsedActive.rows[i].id,
                                start: parsedActive.rows[i].starttime,
                                nature: parsedActive.rows[i].nature,
                                address: parsedActive.rows[i].address
                            }

            let call = new Call(c);
            call.start = dateFormatting(c.start);
            call.address = sanitizeAddy(c.address);

            let found = await Call.findOne({ case: call.case });
            if (found) {
                
                if(found.coordinates.latitude == null)
                {
                    
                    geocode(call.address).then((geo)=>{
                        // console.log(geo.data.results[0].geometry);
                        found.coordinates.latitude = geo.data.results[0].geometry.location.lat;
                        found.coordinates.longitude = geo.data.results[0].geometry.location.lng;
                        found.formatted_address = geo.data.results[0].formatted_address;
                        // console.log(geo.data.results[0].address_components);
                        found.save();
                    });
                }
                // console.log(geo.geometry);
                console.log("Active case already in DB");
            } else {
                if(call.address.includes("CRUISER"))
                {
                    call.address =  "50 W MAIN ST, MERIDEN";
                }


                geocode(call.address).then((geo)=>{
                    // console.log(geo.data.results[0].geometry);
                    call.coordinates.latitude = geo.data.results[0].geometry.location.lat;
                    call.coordinates.longitude = geo.data.results[0].geometry.location.lng;

                    call.save();
                }).catch((err)=>{
                    console.log(err);
                });

                
                console.log("Case: " + call.case + " ACTIVE Inserted");
            }
            // console.log(call);
        }
        console.log("CLOSED CALLS ");
        for (var i = 0; i < parsedClosed.rows.length; i++) {

            let c = {
                agency: parsedClosed.rows[i].agency,
                service: parsedClosed.rows[i].service,
                case: parsedClosed.rows[i].id,
                start: parsedClosed.rows[i].starttime,
                end: parsedClosed.rows[i].closetime,
                nature: parsedClosed.rows[i].nature,
                address: parsedClosed.rows[i].address
            }


            // console.log(closedCalls[i]);
            var call = new Call(c);
            call.address = sanitizeAddy(c.address);
            
            let found = await Call.findOne({ case: call.case });
            if (found) {
                //Check if found call contains the end time, if true it means the previously active call was closed.
                if (!found.end && call.end) {
                    // console.log(found.id + ": " + found.end + " " + call.end);
                    call.end = dateFormatting(c.end);
                    Call.updateOne({_id:found.id}, {$set:{end:call.end}}, { new: true, upsert: false, remove: {}, fields: {} }).then((newcall) => {
                        console.log(found.case+ ": Updated");
                    });
                }
            } else {
                call.start = dateFormatting(c.start);
                call.end = dateFormatting(c.end);
                
                
                call.save();
                console.log("Case: " + call.case + " Inserted");
            }
            // console.log(call);
            // await browser.close();
        }

   
};

async function getClosedCalls(){
    console.log("Getting Current Dispatch Calls...");
    let calls = [];

    return request(closedCallsRequest);

}

async function getCADCalls(){
    console.log("Getting Current Dispatch Calls...");
    let calls = [];

   return request(activeCallsRequest);
    
}

function geocode(address){
    return client.geocode({params:{
        address:address,
        key:process.env.GOOGLE_KEY
    },timeout:1000});

}

function sanitizeAddy(address){
 const regex = new RegExp(/(-[1-9]|-[A-Z]*)\w+/);
 let newAddy = address.replace(regex,"");
 return newAddy;
}

function dateFormatting(input)
{
    let dateregex = new RegExp(/([0-9]+(\/[0-9]+)+)/);
    let timeregex = new RegExp(/([0-9]+(:[0-9]+)+)\s+[a-zA-Z]+/);

    let date = input.match(dateregex);
    let time = input.match(timeregex)[0];

    var data = new Date(date[0]+ ' ' +time);
    data.setHours(data.getHours()-4);

    return data;
}

function delay(time) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
 }


crawl();

// cron.schedule("*/5 * * * *", crawl);

module.exports = {crawl};



//############    BACK UP OF OLD PUPPETEER WAY OF SCRAPING   #############

//Active Calls Scraping
// async function getCADCalls(page) {
//     console.log("Getting Current Dispatch Calls...");

//     await page.goto('http://www.meridenp2c.com/cad/currentcalls.aspx', { waitUntil: 'networkidle2' });
//     await page.select('#pager_center > table > tbody > tr > td:nth-child(5) > select', '10000');
    
//     // await page.waitForNavigation();

//     return await page.evaluate(() => {
//         var rows = Array.from(document.querySelectorAll("#tblDB > tbody> tr"));
//         var calls = [];
//         rows.forEach(element => {

//             var p = element.children;

//             let call = {
//                 agency: p[0].innerHTML,
//                 service: p[1].innerHTML,
//                 case: p[2].innerHTML,
//                 start: p[3].innerHTML,
//                 nature: p[4].innerHTML,
//                 address: p[5].innerHTML
//             }
//             calls.push(call);
//             console.log(call);
//         });
//         return calls;
//     });
// }

// //Closed Calls Scraping
// async function getClosedCalls(page) {
//     console.log("Getting Closed Dispatch Calls...");
//     await page.goto('http://www.meridenp2c.com/cad/callsnapshot.aspx', { waitUntil: 'networkidle2' });

//     //await page.click('#pager_center > table > tbody > tr > td:nth-child(5) > select');
//     await page.select('#pager_center > table > tbody > tr > td:nth-child(5) > select', '10000');
//     await delay(1000);
//     return await page.evaluate(() => {
//         var rows = Array.from(document.querySelectorAll("#tblDB > tbody> tr"));
//         var calls = [];
//         rows.forEach(element => {

//             var p = element.children;

//             let call = {
//                 agency: p[0].innerHTML,
//                 service: p[1].innerHTML,
//                 case: p[2].innerHTML,
//                 start: p[3].innerHTML,
//                 end: p[4].innerHTML,
//                 nature: p[5].innerHTML,
//                 address: p[6].innerHTML
//             }
//             calls.push(call);
//             console.log(call);
//         });
//         return calls;
//     });
// }