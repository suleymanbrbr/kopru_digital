// Ayni sayfada birden cok SVG'nin gradient kimlikleri ("a") cakismasin.
module.exports = {
  plugins: [{ name: 'preset-default', params: { overrides: { removeViewBox: false } } }, 'prefixIds'],
};
