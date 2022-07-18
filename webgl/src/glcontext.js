
const resizeCanvasToDisplaySize = (canvas) => {
    // Lookup the size the browser is displaying the canvas in CSS pixels.
    const displayWidth  = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    // Check if the canvas is not the same size.
    const needResize = canvas.width  !== displayWidth ||
                     canvas.height !== displayHeight;

    if (needResize) {
        // Make the canvas the same size
        canvas.width  = displayWidth;
        canvas.height = displayHeight;
    }

    return needResize;
}


export default glCanvas => {
    const gl = glCanvas.getContext("webgl2");

    resizeCanvasToDisplaySize(glCanvas);
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);

    return gl;
}
