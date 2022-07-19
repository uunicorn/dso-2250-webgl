
import * as constants from './constants.js'
import grid from './grid.js';
import plot from './plot.js';
import Slide from './slide.js'
import initGl, { resizeCanvasToDisplaySize } from './glcontext.js';
import configurationSlice from './configuration-slice.js';
import ControlPanel from './controlpanel.js';
import store from './store.js';

const { useRef, useEffect } = React;
const { useSelector } = ReactRedux;
const { Provider } = ReactRedux;

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
