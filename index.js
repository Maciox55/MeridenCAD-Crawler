const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const cron = require('node-cron');
const Call = require('./Call');
const dotenv = require('dotenv');
var moment = require('moment');
dotenv.config();

const {Client} = require("@googlemaps/google-maps-services-js");


mongoose.connect(process.env.CONNSTRING);



const client = new Client({});

async function crawl() {
    const browser = await puppeteer.launch({ headless: true, muteAudio: true });

    const page = await browser.newPage();

    //TODO: Make crawl functions have callbacks.
    var activeCalls = await getCADCalls(page);
    var closedCalls = await getClosedCalls(page);
    console.log("ACTIVE CALLS ");

    try {
        for (var i = 0; i < activeCalls.length; i++) {
            let call = new Call(activeCalls[i]);
            call.start = dateFormatting(activeCalls[i].start);
            call.address = sanitizeAddy(call.address);
            let found = await Call.findOne({ case: call.case });
            if (found) {
                
                if(found.coordinates.latitude == null)
                {
                    
                    // geocode(call.address).then((geo)=>{
                    //     // console.log(geo.data.results[0].geometry);
                    //     found.coordinates.latitude = geo.data.results[0].geometry.location.lat;
                    //     found.coordinates.longitude = geo.data.results[0].geometry.location.lng;
                    //     found.formatted_address = geo.data.results[0].formatted_address;
                    //     // console.log(geo.data.results[0].address_components);
                    //     found.save();
                    // });
                }
                // console.log(geo.geometry);
                console.log("Active case already in DB");
            } else {
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
        for (var i = 0; i < closedCalls.length; i++) {
            var call = new Call(closedCalls[i]);
            call.address = sanitizeAddy(call.address);
            
            let found = await Call.findOne({ case: call.case });
            if (found) {
                //Check if found call contains the end time, if true it means the previously active call was closed.
                if (!found.end && call.end) {
                    // console.log(found.id + ": " + found.end + " " + call.end);
                    call.end = dateFormatting(closedCalls[i].end);
                    Call.updateOne({_id:found.id}, {$set:{end:call.end}}, { new: true, upsert: false, remove: {}, fields: {} }).then((newcall) => {
                        console.log(found.case+ ": Updated");
                    });
                }
            } else {
                call.start = dateFormatting(closedCalls[i].start);
                call.end = dateFormatting(closedCalls[i].end);
                
                
                call.save();
                console.log("Case: " + call.case + " Inserted");
            }
            // console.log(call);
            await browser.close();
        }
    } catch(e) {
        console.log(e);
        await browser.close();
    }

};

//Active Calls Scraping
async function getCADCalls(page) {
    console.log("Getting Current Dispatch Calls...");

    await page.goto('http://www.meridenp2c.com/cad/currentcalls.aspx', { waitUntil: 'networkidle2' });
    await page.select('#pager_center > table > tbody > tr > td:nth-child(5) > select', '10000');
    
    // await page.waitForNavigation();

    return await page.evaluate(() => {
        var rows = Array.from(document.querySelectorAll("#tblDB > tbody> tr"));
        var calls = [];
        rows.forEach(element => {

            var p = element.children;

            let call = {
                agency: p[0].innerHTML,
                service: p[1].innerHTML,
                case: p[2].innerHTML,
                start: p[3].innerHTML,
                nature: p[4].innerHTML,
                address: p[5].innerHTML
            }
            calls.push(call);
            console.log(call);
        });
        return calls;
    });
}

//Closed Calls Scraping
async function getClosedCalls(page) {
    console.log("Getting Closed Dispatch Calls...");
    await page.goto('http://www.meridenp2c.com/cad/callsnapshot.aspx', { waitUntil: 'networkidle2' });

    //await page.click('#pager_center > table > tbody > tr > td:nth-child(5) > select');
    await page.select('#pager_center > table > tbody > tr > td:nth-child(5) > select', '10000');
    await delay(1000);
    return await page.evaluate(() => {
        var rows = Array.from(document.querySelectorAll("#tblDB > tbody> tr"));
        var calls = [];
        rows.forEach(element => {

            var p = element.children;

            let call = {
                agency: p[0].innerHTML,
                service: p[1].innerHTML,
                case: p[2].innerHTML,
                start: p[3].innerHTML,
                end: p[4].innerHTML,
                nature: p[5].innerHTML,
                address: p[6].innerHTML
            }
            calls.push(call);
            console.log(call);
        });
        return calls;
    });
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