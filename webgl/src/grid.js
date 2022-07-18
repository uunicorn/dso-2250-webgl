
import * as constants from './constants.js';
import { compileProg } from './shaders.js';

const TICK_LENGTH = 0.03;

const axisVSsrc = `
    attribute vec2 a_position;
    uniform mat2 u_scale;

    // all shaders have a main function
    void main() {
        gl_Position = vec4(a_position*u_scale, 0, 1);
    }
`;

const fragmentShaderSrc = `
    precision mediump float;

    uniform vec4 u_color;

    void main() {
        gl_FragColor = u_color;
    }

`;

const dots = (gl, a_position) => {
    const positions = [];

    // Vertical dots
    for(let div = 1; div < constants.DIVS_TIME / 2; ++div) {
        for(let dot = 1; dot < constants.DIVS_VOLTAGE / 2 * constants.DIVS_SUB; ++dot) {
            const dotPosition = dot / constants.DIVS_SUB;
            positions.push([-div, -dotPosition]);
            positions.push([-div, dotPosition]);
            positions.push([div, -dotPosition]);
            positions.push([div, dotPosition]);
        }
    }

    // Horizontal dots
    for(let div = 1; div < constants.DIVS_VOLTAGE / 2; ++div) {
        for(let dot = 1; dot < constants.DIVS_TIME / 2 * constants.DIVS_SUB; ++dot) {
            if (dot % constants.DIVS_SUB == 0) continue;
            const dotPosition = dot / constants.DIVS_SUB;
            positions.push([-dotPosition, -div]);
            positions.push([dotPosition, -div]);
            positions.push([-dotPosition, div]);
            positions.push([dotPosition, div]);
        }
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions.flat()), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

    return () => {
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.POINTS, 0, positions.length);
    };
};

const axis = (gl, a_position) => {
    const positions = [];

    positions.push([-constants.DIVS_TIME/2, 0]);
    positions.push([constants.DIVS_TIME/2, 0]);

    positions.push([0, -constants.DIVS_VOLTAGE/2]);
    positions.push([0, constants.DIVS_VOLTAGE/2]);

    for(let line = 1; line < constants.DIVS_TIME / 2 * constants.DIVS_SUB; ++line) {
        const linePosition = line / constants.DIVS_SUB;
        positions.push([linePosition, -TICK_LENGTH]);
        positions.push([linePosition, TICK_LENGTH]);
        positions.push([-linePosition, -TICK_LENGTH]);
        positions.push([-linePosition, TICK_LENGTH]);
    }

    for(let line = 1; line < constants.DIVS_VOLTAGE / 2 * constants.DIVS_SUB; ++line) {
        const linePosition = line / constants.DIVS_SUB;
        positions.push([-TICK_LENGTH, linePosition]);
        positions.push([TICK_LENGTH, linePosition]);
        positions.push([-TICK_LENGTH, -linePosition]);
        positions.push([TICK_LENGTH, -linePosition]);
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions.flat()), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

    return () => {
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.LINES, 0, positions.length);
    };
};

const scaleMatrix2d = (x, y) => new Float32Array([x, 0, 0, y]);

export default gl => {
    const program = compileProg(gl, axisVSsrc, fragmentShaderSrc);
    const a_position = gl.getAttribLocation(program, "a_position");
    const u_color = gl.getUniformLocation(program, "u_color");
    const u_scale = gl.getUniformLocation(program, "u_scale");

    const drawDots = dots(gl, a_position);
    const drawAxis = axis(gl, a_position);

    gl.useProgram(program);
    gl.uniform4f(u_color, 1, 1, 1, 1);
    gl.uniformMatrix2fv(u_scale, false, scaleMatrix2d(2/constants.DIVS_TIME, 2/constants.DIVS_VOLTAGE));

    return {
        draw: () => {
            gl.useProgram(program);
            drawDots();
            drawAxis();
        }
    };
};

