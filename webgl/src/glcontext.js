
export const resizeCanvasToDisplaySize = (canvas, gl) => {
    // Lookup the size the browser is displaying the canvas in CSS pixels.
    const container = canvas.parentElement;
    const displayWidth  = container.clientWidth;
    const displayHeight = container.clientHeight;

    // Check if the canvas is not the same size.
    const needResize = canvas.width  !== displayWidth ||
                     canvas.height !== displayHeight;

    if (needResize) {
        // Make the canvas the same size
        canvas.width  = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, displayWidth, displayHeight);
    }

    return needResize;
}


export default glCanvas => {
    const gl = glCanvas.getContext("webgl2");

    resizeCanvasToDisplaySize(glCanvas, gl);

    return gl;
}
