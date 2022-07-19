
import configurationSlice from './configuration-slice.js';
import store from './store.js';
import * as constants from './constants.js'

const { useSelector } = ReactRedux;
const { useState } = React;

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
                <button className="btn btn-danger" onClick={stop}>Stop</button>
                <button className="btn btn-success" onClick={start}>Start</button>
            </div>
        </form>
    </div>;
};

export default ControlPanel;
