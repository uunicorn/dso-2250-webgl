
const express = require('express');
const WebSocket = require('ws');
const expressWebSocket = require('express-ws');
const { webusb, usb } = require('usb');

const CONTROL_COMMAND = 0xA2;
const CONTROL_GETSPEED = 0xB2;
const CONTROL_BEGINCOMMAND = 0xB3;
const CONTROL_SETOFFSET = 0xB4;
const CONTROL_SETRELAYS = 0xB5;

const VALUE_CHANNELLEVEL = 0x08;

const cmdSetFilter = 0;
const cmdSetTriggerAndSampleRate = 1;
const cmdForceTrigger = 2;
const cmdCaptureStart = 3;
const cmdTriggerEnabled = 4;
const cmdGetChannelData = 5;
const cmdGetCaptureState = 6;
const cmdSetVoltageAndCoupling = 7;
const cmdSetLogicalData = 8;
const cmdGetLogicalData = 9;
const cmdLast = 10;
const cmdSetChIn = 0xb;
const cmdSetTrigIn = 0xc;
const cmdSetRamLength= 0xd;
const cmdSetSampleRate = 0xe;
const cmdSetTriggerLength = 0xf;

const TRIGGER_CH1 = 0;
const TRIGGER_CH2 = 1;
const TRIGGER_ALT = 2;
const TRIGGER_EXT = 3;

const VOLTAGE_5V = 0;
const VOLTAGE_2V = 1;
const VOLTAGE_1V = 2;
const VOLTAGE_500mV = 3;
const VOLTAGE_200mV = 4;
const VOLTAGE_100mV = 5;
const VOLTAGE_50mV = 6;
const VOLTAGE_20mV = 7;
const VOLTAGE_10mV = 8;

const COUPLING_AC = 0;
const COUPLING_DC = 1;
const COUPLING_OFF = 2;

const SLOPE_POSITIVE = 0;
const SLOPE_NEGATIVE = 1;

const SELECT_CH1 = 0;
const SELECT_CH2 = 1;
const SELECT_CH1CH2 = 2;

const DIVS_TIME = 10;

//usb.setDebugLevel(4);

const sessions = {};
let nextSessionId = 0;
const send = msg => ws => new Promise(acc => ws.send(msg, acc));
const broadcast = msg => Promise.all(Object.values(sessions).map(send(msg)));

const delay = ms => new Promise(acc => setTimeout(acc, ms));

const initDevice = async () => {
    const device = await webusb.requestDevice({
        filters: [{
            vendorId: 0x04b5,
            productId: 0x2250,
            classCode: 0xff,
            protocolCode: 0,
            subclassCode: 0
        }]
    })

    if (!device) {
        throw new Exception('Device not found');
    }

    await device.open();
    
    await device.claimInterface(0);

    const dsoGetConnectionSpeed = async () => {
        const data = await device.controlTransferIn({
            requestType: 'vendor',
            recipient: 'device',
            index: 0,
            request: CONTROL_GETSPEED,
            value: 0,
        }, 10);

        if(data.status != 'ok') {
            console.log(data);
            throw new Exception('Ooops, fail');
        }

        return data.data.getUint8(0);
    };

    const dsoGetChannelLevels = async () => {
        const { data, status } = await device.controlTransferIn({
            requestType: 'vendor',
            recipient: 'device',
            index: 0,
            request: CONTROL_COMMAND,
            value: VALUE_CHANNELLEVEL,
        }, 2*2*9*2);

        if(status !== 'ok') {
            throw new Error('oops');
        }

        const arr = [];
        for(let i = 0;i < 9*2;i++) {
            arr.push([data.getUint16(i*4), data.getUint16(i*4+2)]);
        }

        return [[...arr.slice(0, 9)], [...arr.slice(9, 18)]];
    };

    const dsoBeginCommand = () => device.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        index: 0,
        request: CONTROL_BEGINCOMMAND,
        value: 0,
    }, new Uint8Array([0xf, 3, 3, 3, 0, 0, 0, 0, 0, 0]));

    const readBulk = len => device.transferIn(0x86, len);
    const writeBulk = buf => device.transferOut(0x02, buf);

    const dsoCmd = async buff => {
        //console.log('dsoCmd', buff);
        await dsoBeginCommand();
        //await dsoGetConnectionSpeed();
        await writeBulk(new Uint8Array(buff));
        //console.log('done');
    };

    const dsoGetLogicData = async () => {
        await dsoCmd([cmdGetLogicalData, 0]);
        
        const logical = await readBulk(512);
        if(logical.status != 'ok') {
            console.log(logical);
            throw new Exception('Ooops, fail');
        }
        
        return logical.data.getUint8(1);
    };

    let oldRelays = [];

    const dsoSetVoltageAndCoupling = async (channels, triggerSource) => {
        let v = 0;

        v |= (3 - (channels[0].voltage % 3));
        v |= (3 - (channels[1].voltage % 3)) << 2;
        v |= 3 << 4;

        await dsoCmd([cmdSetVoltageAndCoupling, 0xf, v, 0, 0, 0, 0, 0]);

        const ch1Voltage = channels[0].voltage/3 | 0;
        const ch2Voltage = channels[1].voltage/3 | 0;

        const relays = [ 0x00, 0x04, 0x08, 0x02, 0x20, 0x40, 0x10, 0x01,
                        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ];

        if(ch1Voltage > 0)
            relays[1] = ~relays[1];

        if(ch1Voltage > 1)
            relays[2] = ~relays[2];

        if(channels[0].coupling)
            relays[3] = ~relays[3];

        if(ch2Voltage > 0)
            relays[4] = ~relays[4];

        if(ch2Voltage > 1)
            relays[5] = ~relays[5];

        if(channels[1].coupling)
            relays[6] = ~relays[6];

        if(triggerSource === TRIGGER_EXT)
            relays[7] = ~relays[7];

        if(JSON.stringify(relays) === JSON.stringify(oldRelays))
            return;

        oldRelays = relays;

        await device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            index: 0,
            request: CONTROL_SETRELAYS,
            value: 0,
        }, new Uint8Array(relays));
    };

    const dsoSetOffset = async (ch1off, ch2off, triggerOff) => {
        const buff = new ArrayBuffer(17);
        const view = new DataView(buff);

        view.setUint16(0, ch1off | 0x2000, false);
        view.setUint16(2, ch2off | 0x2000, false);
        view.setUint16(4, triggerOff | 0x2000, false);

        await device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            index: 0,
            request: CONTROL_SETOFFSET,
            value: 0,
        }, buff);
    };

    const dsoSetTrigIn = async (source, slope) => {
        const buff = new ArrayBuffer(8);
        const view = new DataView(buff);

        const filter = 0;
        const params = [0, 0, 0, 1]; // filter params?
        let v = 0;

        v = params[0];
        v <<= 2;
        v |= params[2] & 3;
        v <<= 1;
        v |= params[1] & 1;
        v <<= 1;
        v |= filter & 1;
        v <<= 1;
        v |= slope & 1;
        v <<= 2;
        v |= [2, 3, 2, 0, 0][source] & 3;

        view.setUint8(0, cmdSetTrigIn);
        view.setUint8(1, 0xf);
        view.setUint8(2, v);
        view.setUint32(4, params[3], true);

        await dsoCmd(buff);
    };

    const dsoSetChIn = chanSel => dsoCmd([cmdSetChIn, 0xf, chanSel, 0]);
    const dsoSetRamLength = rl => dsoCmd([cmdSetRamLength, 0xf, rl & 7, 0]);

    const dsoSetSampleRateAux = async (source, divider) => {
        const buff = new ArrayBuffer(8);
        const view = new DataView(buff);

        divider = divider | 0;
        view.setUint8(0, cmdSetSampleRate);
        view.setUint8(2, ((divider !== 1) << 1) | source);
        view.setUint16(4, 0x10001 - divider, true);

        await dsoCmd(buff);
    };

    let sample_t = 0;
    const dsoSetSampleRate = async t => {
        if(t <= 8e-9) {
            sample_t = 8e-9; // 125MHz
            await dsoSetSampleRateAux(1, 1);
            return;
        }

        sample_t = 10e-9; // 100MHz
        while(true) {
            for(let m of [1, 2, 4]) {
                if(t <= sample_t*m) {
                    sample_t *= m;
                    await dsoSetSampleRateAux(0, sample_t/10e-9);
                    return;
                }
            }

            sample_t *= 10;
        }
    };

    const dsoSetTriggerLength = async (triggerAddress, dataLength) => {
        if(triggerAddress <= 0)
            triggerAddress = 1;
        
        if(triggerAddress > 98)
            triggerAddress = 98;

        let [ebx, eax] = [0, 0];


        if(dataLength == 1) {
            const samples = 10240*triggerAddress/100 | 0;
            ebx = 0x7ffff - 10240 + samples;
            eax = 0x7ffff - samples;
        } else if(dataLength == 2) {
            const samples = 0x80000*triggerAddress/100 | 0;
            ebx = 0x7ffff - 0x80000 + samples;
            eax = 0x7ffff - samples;
        }

        const buff = new ArrayBuffer(12);
        const view = new DataView(buff);
        view.setUint8(0, cmdSetTriggerLength);
        view.setUint32(2, eax & 0x7ffff, true);
        view.setUint32(6, ebx & 0x7ffff, true);

        await dsoCmd(buff);
    };

    const dsoSetFilter = async ({ch1, ch2, trig}) => {
        let filter = 0;

        filter |= ch1;
        filter |= ch2 << 1;
        filter |= trig << 2;
        filter |= 0 << 3; // reserved

        await dsoCmd([cmdSetFilter, 0xf, filter, 0, 0, 0, 0, 0, 0]);
    };

    const dsoCaptureStart = () => dsoCmd([cmdCaptureStart, 0]);
    const dsoTriggerEnabled = () => dsoCmd([cmdTriggerEnabled, 0]);
    const dsoForceTrigger = () => dsoCmd([cmdForceTrigger, 0]);

    const tpTransform = tp => {
        let rc = 0;
        let a = 0;

        for(let i = 0; i < 16; i++) {
            if(tp & 0x8000) {
                a ^= 1;
            }

            rc <<= 1;
            rc |= a;
            tp <<= 1;
        }

        return rc;
    };

    const dsoGetCaptureState = async () => {
        await dsoCmd([cmdGetCaptureState, 0]);
        const response = await readBulk(512);

        if(response.status != 'ok') {
            console.log(response);
            throw new Exception('Ooops, fail');
        }
        const state = response.data.getUint8(0);
        const a = response.data.getUint8(1)
        const b = response.data.getUint16(2, true);
        return [state, tpTransform((a << 16) | b)];
    };

    const dsoGetChannelData = async () => {
        await dsoCmd([cmdGetChannelData, 0]);
        const rc = new Uint8Array(40*512);
        
        for(let i=0;i<40;i++) {
            const response = await readBulk(512);

            if(response.status !== 'ok') {
                console.log(response);
                throw new Exception('Ooops, fail');
            }

            rc.set(new Uint8Array(response.data.buffer), i*512);
        }

        return rc;
    };

    let config = {
        channels: [
            {
                voltage: VOLTAGE_1V,
                coupling: COUPLING_DC,
                offset: 0.5
            }, {
                voltage: VOLTAGE_1V,
                coupling: COUPLING_DC,
                offset: 0.5
            }
        ],
        trigger: {
            source: TRIGGER_CH1,
            slope: SLOPE_POSITIVE,
            offset: 0.5
        },
        channelSelect: SELECT_CH1CH2,
        dataLength: 1, // 10240 samples/frame
        timeBase: 1e-3/10240*DIVS_TIME, // 1ms / DIV
        triggerAddress: 50,
        filter: {
            ch1: 0,
            ch2: 0,
            trig: 0
        }
    };

    console.log('HW version: ' + await dsoGetLogicData());

    const levels = await dsoGetChannelLevels();

    levels[0][8-VOLTAGE_1V] = [100, 226]; // TODO: [104, 231] now. calibrate me

    const chanOffset = chan => {
        const cfg = config.channels[chan];
        const [minimum, maximum] = levels[chan][8-cfg.voltage];

        const value = cfg.offset * (maximum - minimum) + minimum + 0.5 | 0;
        const real = (value - minimum) / (maximum - minimum);

        return { value, real };
    };

    const bound = (l, x, h) => x < l ? l : (x > h ? h : x);

    const trigOffset = () => {
        if(config.trigger.source >= config.channels.length || config.trigger.source < 0) {
            return 0x7f;
        }
        const [minimum, maximum] = [0, 0xfd];
        const cfg = config.channels[config.trigger.source];
        // signal 33 -> 95
        // trigger 38 -> 91

        // signal 179 -> 241
        // trigger 175 -> 227
        const level = (config.trigger.offset)*(maximum-minimum) + 0.5;

        return bound(minimum, level | 0, maximum);
    };

    const setLevels = async () => {
        await dsoSetOffset(chanOffset(0).value, chanOffset(1).value, trigOffset());
    };


    const dsoConfigure = async cfg => {
        config = cfg;
        
        await dsoSetVoltageAndCoupling(cfg.channels, cfg.trigger.source);
        await dsoSetTrigIn(cfg.trigger.source, cfg.trigger.slope);
        await dsoSetChIn(cfg.channelSelect);
        await dsoSetRamLength(cfg.dataLength);
        await dsoSetSampleRate(cfg.timeBase);
        await dsoSetTriggerLength(cfg.triggerAddress*cfg.timeBase/sample_t, cfg.dataLength);
        await dsoSetFilter(cfg.filter);
        await setLevels();
    };

    if(1 !== await dsoGetConnectionSpeed()) {
        throw new Exception('USB is not at High Speed');
    }

    const makeStopedHeader = () => {
        const buff = new ArrayBuffer(32);
        const view = new DataView(buff);
        view.setUint16(0, 2);
        return buff;
    };

    const makeFrameHeader = () => {
        const buff = new ArrayBuffer(32);
        const view = new DataView(buff);
        view.setUint16(0, 1);
        view.setUint16(2, buff.byteLength);
        view.setFloat32(4, config.timeBase);
        view.setFloat32(8, sample_t);
        return buff;
    };

    dsoConfigure(config);

    let running = false;
    let stopped = null;

    const run = async () => {
        if(running)
            return;

        running = true;

        try {
            await dsoCaptureStart();
            await dsoTriggerEnabled();
            await dsoForceTrigger();

            let cnt = 0;
            for(;!stopped;) {
                const [state, tp] = await dsoGetCaptureState();
                //console.log(state, tp);

                if(state === 0) { // waiting
                    if(cnt++ > 10) {
                        cnt = 0;
                        await dsoForceTrigger();
                    }
                } else if(state === 1) {
                    // capturing
                } else if(state === 3) { // ready
                    cnt = 0;
                    const data = await dsoGetChannelData();
                    const header = makeFrameHeader();
                    const frame = new Uint8Array(header.byteLength + data.length);
                    frame.set(new Uint8Array(header), 0)
                    frame.set(data.slice(tp*2), header.byteLength);
                    //console.log(data.slice(0, 100));
                    frame.set(data.slice(0, tp*2), header.byteLength + data.length - tp*2);
                    //console.log(tp);
                    await broadcast(frame);
                    await dsoCaptureStart();
                    await dsoTriggerEnabled();
                } else {
                    console.log('unknown state');
                }
                await delay(10);
            }
        } finally {
            await broadcast(makeStopedHeader());
            running = false;

            if(stopped)
                stopped();
        }
    };

    const stop = async () => {
        if(running)
            await new Promise(acc => stopped = acc);

        stopped = null;
    };

    return {
        stop: stop,

        getConfig: () => config,

        configure: async cfg => {
            let restart = false;

            if(running) {
                restart = true;
                await stop();
            }

            await dsoConfigure(cfg);

            if(restart) {
                console.log('resarting');
                run();
            }
        },

        start: run
    };
};

const device = initDevice();

    //await device.close();

const app = express({
    noDelay: true
});
 
expressWebSocket(app, null, {
    perMessageDeflate: false
});

app.use(express.static('../webgl/dist'));
app.use(express.json());

app.ws('/frames', (ws, req) => {
    try {
        const mySessionId = nextSessionId++;

        sessions[mySessionId] = ws;

        console.log(`${mySessionId}: WebSock connected`);

        ws.on('message', async data => {
            console.log(`${mySessionId}: message`, data);
            const msg = JSON.parse(data);
            const dev = await device;
            dev[msg.type](msg.params);
        });

        ws.on('close', () => {
            console.log(`${mySessionId}: WebSock stream was closed`);
            delete sessions[mySessionId];
        });
    } catch(e) {
        console.error(e);
    }
});

app.get('/start', async (request, response) => {
    const dev = await device;
    dev.start(); // don't wait for start to finish
    response.send('ok');
});

app.get('/stop', async (request, response) => {
    const dev = await device;
    await dev.stop();
    response.send('ok');
});

app.get('/configuration', async (request, response) => {
    const dev = await device;
    response.send(dev.getConfig());
});

app.post('/configuration', async (request, response) => {
    console.log('POST configuration', request.body);
    const dev = await device;
    await dev.configure(request.body);
    response.send({ status: 'ok' });
});

app.maxConnections = 1024;
app.listen(3333, () => console.log('Listening on 3333'));

