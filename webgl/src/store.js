
import configurationSlice from './configuration-slice.js';

const { configureStore } = RTK;

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

    //console.log('store.listen', response);
});

const init = async () => {
    const resp = await fetch('/configuration');
    const body = await resp.json();
    oldCfg = JSON.stringify(body);

    // console.log(body);
    store.dispatch(configurationSlice.actions.setConfiguration(body));
};

init();

export default store;
