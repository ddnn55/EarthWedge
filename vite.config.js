import copy from 'rollup-plugin-copy'

export default {
  plugins: [
    copy({
        targets: [
        //   { src: 'src/index.html', dest: 'dist/public' },
        //   { src: ['assets/fonts/arial.woff', 'assets/fonts/arial.woff2'], dest: 'dist/public/fonts' },
          // { src: 'node_modules/cesium/Build/Cesium/**/*', dest: 'public/Cesium' },
          { src: 'node_modules/three/examples/jsm/libs/draco/**/*', dest: 'draco' }
        ]
      })
  ]
}
