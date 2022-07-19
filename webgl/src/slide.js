
const { useRef, useEffect, useState } = React;

const bound = (l, x, h) => x < l ? l : (x > h ? h : x);

const Slide = ({defaultValue, onChange, vertical, children}) => {
    const [value, setValue] = useState(Number(defaultValue));
    const ref = useRef();
    const off = useRef();

    useEffect(() => setValue(defaultValue), [defaultValue]);

    // cleanup global even listeners if the component dismounted while dragging
    useEffect(() => () => off.current && off.current(), []);

    const parentRect = () => ref.current.parentElement.getBoundingClientRect();
    const maxPixels = () => vertical ? parentRect().height : parentRect().width;
    const curPixels = e => vertical ? e.pageY : e.pageX;
    const style = {
        position: 'absolute',
    };

    style[vertical ? 'top' : 'left'] = (100*value) + '%';
    style['transform'] = vertical ? 'translate(0, -50%)' : 'translate(-50%, 0)';


    const mousedown = e => {
        e.preventDefault();
        e.stopPropagation();

        const origValue = value;
        const origPixels = curPixels(e);
        const newValue = e => bound(0, origValue + (curPixels(e)-origPixels)/maxPixels(), 1);

        const mousemove = e => {
            e.preventDefault();
            setValue(newValue(e));
        };

        const mouseup = e => {
            e.preventDefault();
            setValue(newValue(e));
            onChange(newValue(e));
            mouseoff();
        };

        const mouseoff = () => {
            document.removeEventListener('mouseup', mouseup);
            document.removeEventListener('mousemove', mousemove);
        };

        document.addEventListener('mouseup', mouseup);
        document.addEventListener('mousemove', mousemove);

        off.current = mouseoff;
    };

    return <div ref={ref} style={style} onMouseDown={mousedown}>{children}</div>;
};

export default Slide;
