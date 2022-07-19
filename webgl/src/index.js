
import * as constants from './constants.js'
import grid from './grid.js';
import plot from './plot.js';
import Slide from './slide.js'
import initGl, { resizeCanvasToDisplaySize } from './glcontext.js';
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

    oldCfg = scfg;

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
};

const Canvas = () => {
    const cref = useRef();

    useEffect(() => {
        const glCanvas = cref.current;
        const gl = initGl(glCanvas);

        const gridVao = grid(gl);
        const plotVao = plot(gl);

        const draw = timestamp => {
            resizeCanvasToDisplaySize(glCanvas, gl);

            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gridVao.draw();
            plotVao.draw();
        };

        const redraw = () => window.requestAnimationFrame(draw);
        
        window.addEventListener('resize', () => draw());

        redraw();

        connect((scale, buffer) => {
            plotVao.setData(scale, buffer);
            redraw();
        });
    }, [cref]);

    return <canvas id="thecanvas" ref={cref}></canvas>;
};

const VoltageGain = ({ch}) => {
    const actions = configurationSlice.actions;
    const gain = useSelector(state => state.configuration.channels[ch].voltage);
    const setGain = gainId => store.dispatch(actions.setGain({ ch, gainId }));

    const change = e => {
        const val = Number(e.target.value);
        setGain(val);
    };

    return <select className="form-control" value={gain} onChange={change}>
        <option value={ constants.VOLTAGE_5V }>5V</option>
        <option value={ constants.VOLTAGE_2V }>2V</option>
        <option value={ constants.VOLTAGE_1V }>1V</option>
        <option value={ constants.VOLTAGE_500mV }>500mV</option>
        <option value={ constants.VOLTAGE_200mV }>200mV</option>
        <option value={ constants.VOLTAGE_100mV }>100mV</option>
        <option value={ constants.VOLTAGE_50mV }>50mV</option>
        <option value={ constants.VOLTAGE_20mV }>20mV</option>
        <option value={ constants.VOLTAGE_10mV }>10mV</option>
    </select>;
};

const Coupling = ({ch}) => {
    const actions = configurationSlice.actions;
    const value = useSelector(state => state.configuration.channels[ch].coupling);
    const setCoupling = coupling => store.dispatch(actions.setCoupling({ ch, coupling }));

    const change = e => {
        const val = Number(e.target.value);
        setCoupling(val);
    };

    return <select className="form-control" value={value} onChange={change}>
        <option value={constants.COUPLING_AC}>AC</option>
        <option value={constants.COUPLING_DC}>DC</option>
        <option value={constants.COUPLING_OFF}>OFF</option>
    </select>;
};

const ChannelControls = ({ch}) => {
    const name = ['CH1', 'CH2'][ch];

    return <div className="form-group row">
        <label className="col-sm-2 col-form-label">{name}</label>
        <div className="col-sm-5"><VoltageGain ch={ch} /></div>
        <div className="col-sm-5"><Coupling ch={ch} /></div>
    </div>;
};

const TimeBase = () => {
    const actions = configurationSlice.actions;
    const timeBase = useSelector(state => state.configuration.timeBase);
    const setTimeBase = t => store.dispatch(actions.setTimeBase(t));

    const change = e => {
        const val = Number(e.target.value);
        console.log(val);
        setTimeBase(val);
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

    const times = [];

    for(let t = 100e-9;t < 1;t *= 10) {
        for(let m of [1, 2, 4]) {
            const tt = t*m;

            times.push({ t: tt*constants.DIVS_TIME/10240, text: timeTxt(tt) });
        }
    }

    return <select className="form-control" value={timeBase} onChange={change}>
        { times.map(({t, text}) => <option key={t} value={t}>{text}</option> ) }
    </select>;
};

const TriggerSource = props => {
    const actions = configurationSlice.actions;
    const value = useSelector(state => state.configuration.trigger.source);
    const setTriggerSource = source => store.dispatch(actions.setTriggerSource(source));

    const change = e => {
        const val = Number(e.target.value);
        setTriggerSource(val);
    };

    return <select className="form-control" value={value} onChange={change} {...props}>
        <option value={constants.TRIGGER_CH1}>CH1</option>
        <option value={constants.TRIGGER_CH2}>CH2</option>
        <option value={constants.TRIGGER_ALT}>ALT</option>
        <option value={constants.TRIGGER_EXT}>EXT</option>
    </select>;
};

const TriggerSlope = () => {
    const actions = configurationSlice.actions;
    const value = useSelector(state => state.configuration.trigger.slope);
    const setTriggerSlope = slope => store.dispatch(actions.setTriggerSlope(slope));

    const change = e => {
        const val = Number(e.target.value);
        setTriggerSlope(val);
    };

    return <select className="form-control" value={value} onChange={change}>
        <option value={constants.SLOPE_POSITIVE}>↗</option>
        <option value={constants.SLOPE_NEGATIVE}>↘</option>
    </select>;
};

const ControlPanel = () => {
    const start = e => {
        e.preventDefault();
        fetch('/start');
    };

    const stop = e => {
        e.preventDefault();
        fetch('/stop');
    };

    return <div id="control">
        <form>
            <div className="form-group row">
                <label className="col-sm-2 col-form-label">Timebase</label>
                <div className="col-sm-8"><TimeBase /></div>
                <div className="col-sm-2 col-form-label">/ div</div>
            </div>
            <div className="form-group row">
                <label className="col-sm-2 col-form-label">Trigger</label>
                <div className="col-sm-5"><TriggerSource /></div>
                <div className="col-sm-5"><TriggerSlope /></div>
            </div>
            <ChannelControls ch={0} />
            <ChannelControls ch={1} />
            <div className="form-group buttons">
                <button className="btn btn-primary" onClick={start}>Start</button>
                <button className="btn btn-primary" onClick={stop}>Stop</button>
            </div>
        </form>
    </div>;
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
                <div id="canvas-container">
                    <Canvas />
                </div>
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
        <ControlPanel />
    </div>;
};

const main = () => {
    ReactDOM.render(<Provider store={store}><App/></Provider>, 
        document.getElementById('app'));

};

window.addEventListener("load", main, false);
