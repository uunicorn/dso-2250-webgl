
const { createSlice } = window.RTK;
import * as constants from './constants.js'


export default createSlice({
    name: 'configuration',
    initialState: {
        channels: [{}, {}],
        trigger: {}
    },
    reducers: {
        setGain: (state, {payload}) => { state.channels[payload.ch].voltage = payload.gainId; },
        setChannelOffset: (state, {payload}) => { state.channels[payload.ch].offset = payload.offset; },
        setCoupling: (state, {payload}) => { state.channels[payload.ch].coupling = payload.coupling; },
        setTriggerSource: (state, {payload}) => { state.trigger.source = payload; },
        setTriggerSlope: (state, {payload}) => { state.trigger.slope = payload; },
        setTriggerOffset: (state, {payload}) => { state.trigger.offset = payload; },
        setTriggerAddress: (state, {payload}) => { state.triggerAddress = payload; },
        setTimeBase: (state, {payload}) => { state.timeBase = payload; },
        setConfiguration: (state, {payload}) => { return payload; }
    }
});

