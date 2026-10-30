const R = window.React;
function jsx(type, props, key) {
  const p = Object.assign({}, props);
  if (key !== undefined) p.key = key;
  const children = p.children;
  delete p.children;
  return children === undefined ? R.createElement(type, p) : R.createElement(type, p, children);
}
export { jsx, jsx as jsxs, jsx as jsxDEV };
export const Fragment = R.Fragment;
