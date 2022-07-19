
import * as constants from './constants.js'
import grid from './grid.js';
import plot from './plot.js';
import Slide from './slide.js'
import initGl from './glcontext.js';
import configurationSlice from './configuration-slice.js';

const { useRef, useEffect, useState } = React;
const { useSelector } = ReactRedux;
const { configureStore } = RTK;
const { Provider } = ReactRedux;

const store = configureStore({
    reducer: {
        configuration: configurationSlice.reducer
    }
});

let oldCfg = '';

store.subscribe(async () => {
    const cfg = store.getState().configuration;
    const scfg = JSON.stringify(cfg);

    console.log('store.subscribe', cfg);

    if(oldCfg === scfg)
        return;

    const response = await fetch('/configuration', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: scfg
    });
    console.log('store.listen', response);
});

const init = async () => {
    const resp = await fetch('/configuration');
    const body = await resp.json();
    oldCfg = JSON.stringify(body);
    console.log(body);
    store.dispatch(configurationSlice.actions.setConfiguration(body));
};

init();

let config = {
    channels: [
        {
            voltage: constants.VOLTAGE_1V,
            coupling: constants.COUPLING_DC,
            offset: 0.5
        }, {
            voltage: constants.VOLTAGE_1V,
            coupling: constants.COUPLING_DC,
            offset: 0.5
        }
    ],
    trigger: {
        source: constants.TRIGGER_CH1,
        slope: constants.SLOPE_POSITIVE
    },
    channelSelect: constants.SELECT_CH1CH2,
    dataLength: 1, // 10240 samples/frame
    timeBase: 1e-3/10240*constants.DIVS_TIME, // 1ms / DIV
    triggerAddress: 50,
    filter: {
        ch1: 0, 
        ch2: 0,
        trig: 0
    }

};

const oldUi = socket => {

    $('#start').click(e => {
        socket.send(JSON.stringify({
            type: 'start',
            params: {}
        }));
    });

    $('#stop').click(e => {
        socket.send(JSON.stringify({
            type: 'stop',
            params: {}
        }));
    });

    const reconfigure = () => {
        socket.send(JSON.stringify({
            type: 'configure',
            params: config
        }));
    };

    const timeTxt = v => {
        if(v < 1e-6)
            return `${v*1e9 + 0.5 | 0} ns`;

        if(v < 1e-3)
            return `${v*1e6 + 0.5 | 0} us`;

        if(v < 1)
            return `${v*1e3 + 0.5 | 0} ms`;

        return `${v + 0.5 | 0} s`;
    };

    for(let t = 100e-9;t < 1;t *= 10) {
        for(let m of [1, 2, 4]) {
            const tt = t*m;

            $('<option>')
                .attr('value', tt)
                .text(timeTxt(tt))
                .appendTo($('#timebase'));
        }
    }

    $('#timebase').change(function(e) {
        config.timeBase = Number($(this).val())*constants.DIVS_TIME/10240;
        reconfigure();
    });

    $('#ch1-gain').change(function(e) {
        config.channels[0].voltage = Number($(this).val());
        reconfigure();
    });

    $('#ch2-gain').change(function(e) {
        config.channels[1].voltage = Number($(this).val());
        reconfigure();
    });

};

const connect = newData => {
    let busy = false;
    const handleFrame = async frame => {
        if(busy) {
            console.log('Opps, frame arrived, but we are still busy');
            return;
        }
        busy = true;
        try {
            const buffer = await frame.arrayBuffer();
            const view = new DataView(buffer);
            const type = view.getUint16(0);

            if(type === 1) {
                const hdrLen = view.getUint16(2);
                const timeBase = view.getFloat32(4);
                const sample_t = view.getFloat32(8); // TODO - set on configure response

                newData(sample_t/timeBase, buffer.slice(hdrLen));
            } else if(type === 2) {
                console.log('stopped');
            }
        } finally {
            busy = false;
        }
    };

    const { protocol, hostname, port } = window.location;
    const proto = protocol === 'https' ? 'wss' : 'ws';
    const url = `${proto}://${hostname}:${port}/frames`;
    const socket = new WebSocket(url);


    socket.addEventListener('open', event => {
        console.log('Connected');
    });

    socket.addEventListener('message', event => {
        handleFrame(event.data);
    });

    oldUi(socket);
};

const Canvas = () => {
    const cref = useRef();

    useEffect(() => {
        const glCanvas = cref.current;
        const gl = initGl(glCanvas);

        const gridVao = grid(gl);
        const plotVao = plot(gl);

        const draw = timestamp => {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gridVao.draw();
            plotVao.draw();
        };

        const redraw = () => window.requestAnimationFrame(draw);
        
        redraw();

        connect((scale, buffer) => {
            plotVao.setData(scale, buffer);
            redraw();
        });
    }, [cref]);

    return <canvas id="thecanvas" ref={cref}></canvas>;
};

const App = props => {
    const trigOffset = useSelector(state => state.configuration.triggerAddress)/100;
    const trigLevel = 1-useSelector(state => state.configuration.trigger.offset);
    const chLevels = [0,1].map(ch => 1-useSelector(state => state.configuration.channels[ch].offset));

    const actions = configurationSlice.actions;
    const setTriggerOffset = v => store.dispatch(actions.setTriggerAddress(v*100));
    const setTriggerLevel = v => store.dispatch(actions.setTriggerOffset(1-v));
    const setChLevel = ch => v => store.dispatch(actions.setChannelOffset({ ch, offset: 1-v }));

    return <div id="all">
        <div id="scope">
            <div id="top-row">
                <div id="top-left"></div>
                <div id="top-ind" className="indicator-area">
                    <Slide defaultValue={trigOffset} onChange={setTriggerOffset}>
                        <div className="trig-position">T</div>
                    </Slide>
                </div>
                <div id="top-right"></div>
            </div>
            <div id="mid-row">
                <div id="left-ind" className="indicator-area">
                    <Slide vertical={true} defaultValue={chLevels[0]} onChange={setChLevel(0)}>
                        <div className="ch1">1</div>
                    </Slide>
                    <Slide vertical={true} defaultValue={chLevels[1]} onChange={setChLevel(1)}>
                        <div className="ch2">2</div>
                    </Slide>
                </div>
                <Canvas />
                <div id="right-ind" className="indicator-area">
                    <Slide vertical={true} defaultValue={trigLevel} onChange={setTriggerLevel}>
                        <div className="trig-level">T</div>
                    </Slide>
                </div>
            </div>
            <div id="bottom-row">
                <div id="bottom-left"></div>
                <div id="bottom-ind" className="indicator-area"></div>
                <div id="bottom-right"></div>
            </div>
        </div>
        <div id="control">
            <button id="start">Start</button>
            <button id="stop">Stop</button>
            <br/>
            <select id="timebase"></select>
            <br/>
            Ch1 <select id="ch1-gain">
                <option value="0">5V</option>
                <option value="1">2V</option>
                <option value="2">1V</option>
                <option value="3">500mV</option>
                <option value="4">200mV</option>
                <option value="5">100mV</option>
                <option value="6">50mV</option>
                <option value="7">20mV</option>
                <option value="8">10mV</option>
            </select>
            Ch2 <select id="ch2-gain">
                <option value="0">5V</option>
                <option value="1">2V</option>
                <option value="2">1V</option>
                <option value="3">500mV</option>
                <option value="4">200mV</option>
                <option value="5">100mV</option>
                <option value="6">50mV</option>
                <option value="7">20mV</option>
                <option value="8">10mV</option>
            </select>
        </div>
    </div>;
};

const main = () => {
    ReactDOM.render(<Provider store={store}><App/></Provider>, 
        document.getElementById('app'));

};

window.addEventListener("load", main, false);
