
import * as constants from './constants.js'
import grid from './grid.js';
import plot from './plot.js';
import initGl from './glcontext.js';

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

const main = () => {
    const glCanvas = document.getElementById("thecanvas");
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

    let sample_t = 1.0;

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
                sample_t = view.getFloat32(8); // TODO - set on configure response

                plotVao.setData(sample_t/timeBase, buffer.slice(hdrLen));
                redraw();
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

    $('#configure').click(async e => {
        config = eval('(' + $('#config').val() + ')');
        reconfigure();
    });

    const reconfigure = () => {
        socket.send(JSON.stringify({
            type: 'configure',
            params: config
        }));
    };

    const bound = (l, x, h) => x < l ? l : (x > h ? h : x);

    $('.h-indicator').on('mousedown', function(e) {
        e.preventDefault();
        const $i = $(this);
        const origX = e.pageX;
        const origOffset = $i.position();

        const move = e => {
            e.preventDefault();
            const newX = e.pageX;
            const maxX = $i.parent().width() - $i.width();
            const offsetX = bound(0, origOffset.left + newX-origX, maxX);

            $i.css({ left: offsetX });
        };

        const up = e => {
            $(document)
                .off('mousemove', move)
                .off('mouseup', up);

            const pos = $i.position().left + $i.width()/2;
            const value = pos/$i.parent().width();
            $i.trigger('slide-done', [{ value }]);
        };

        $(document)
            .on('mousemove', move)
            .on('mouseup', up);
    });

    $('.v-indicator').on('mousedown', function(e) {
        e.preventDefault();
        const $i = $(this);
        const origY = e.pageY;
        const origOffset = $i.position();

        const move = e => {
            e.preventDefault();
            const newY = e.pageY;
            const maxY = $i.parent().height() - $i.height();
            const offsetY = bound(0, origOffset.top + newY-origY, maxY);

            $i.css({ top: offsetY });
        };

        const up = e => {
            $(document)
                .off('mousemove', move)
                .off('mouseup', up);

            const pos = $i.position().top + $i.height()/2;
            const value = pos/$i.parent().height();
            $i.trigger('slide-done', [{ value }]);
        };

        $(document)
            .on('mousemove', move)
            .on('mouseup', up);
    });

    $('.ch1').on('slide-done', (e, {value}) => {
        config.channels[0].offset = 1 - value;
        console.log('ch1');
        reconfigure();
    });

    $('.ch2').on('slide-done', (e, {value}) => {
        config.channels[1].offset = 1 - value;
        console.log('ch2');
        reconfigure();
    });

    $('.trig-level').on('slide-done', (e, {value}) => {
        config.trigger.offset = 1 - value;
        console.log('trig-level');
        reconfigure();
    });

    $('.trig-position').on('slide-done', (e, {value}) => {
        config.triggerAddress = value*100;

        console.log('trig-position');
        reconfigure();
    });

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

window.addEventListener("load", main, false);
