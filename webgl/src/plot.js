
import { compileProg } from './shaders.js';

const vertexShader = `
    attribute float a_index;
    attribute float a_amplitude;
    uniform float u_timescale;

    void main() {
        gl_Position = vec4(a_index/10240.0*2.0*u_timescale-1.0, a_amplitude/255.0*2.0-1.0, 0, 1);
    }
`;

const fragmentShader = `
    precision mediump float;

    uniform vec4 u_color;

    void main() {
        gl_FragColor = u_color;
    }

`;

const makeIndicesBuffer = gl => {
    const indices = Uint16Array.from({ length: 10240 }, (_, i) => i);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    return indexBuffer;
};

export default gl => {
    const program = compileProg(gl, vertexShader, fragmentShader);

    const a_index = gl.getAttribLocation(program, "a_index");
    const a_amplitude = gl.getAttribLocation(program, "a_amplitude");
    const u_color = gl.getUniformLocation(program, "u_color");
    const u_timescale = gl.getUniformLocation(program, "u_timescale");

    const indexBuffer = makeIndicesBuffer(gl);
    const plotBuffer = gl.createBuffer();

    const makePlotVao = ch => {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, plotBuffer);
        gl.enableVertexAttribArray(a_amplitude);
        gl.vertexAttribPointer(a_amplitude, 1, gl.UNSIGNED_BYTE, false, 2, !ch);

        gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
        gl.enableVertexAttribArray(a_index);
        gl.vertexAttribPointer(a_index, 1, gl.UNSIGNED_SHORT, false, 0, 0);

        return vao;
    };

    const chVao = [0, 1].map(makePlotVao);

    return {
        setData: (timescale, data) => {
            gl.useProgram(program);

            gl.uniform1f(u_timescale, timescale);
            gl.bindBuffer(gl.ARRAY_BUFFER, plotBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        },
        draw: () => {
            gl.useProgram(program);

            gl.uniform4f(u_color, 1, 0, 0, 1);
            gl.bindVertexArray(chVao[0]);
            gl.drawArrays(gl.LINE_STRIP, 0, 10240);

            gl.uniform4f(u_color, 0, 1, 0, 1);
            gl.bindVertexArray(chVao[1]);
            gl.drawArrays(gl.LINE_STRIP, 0, 10240);
        }
    };
};

