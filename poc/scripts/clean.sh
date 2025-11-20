rm -rf node_modules
npm cache clean --force
npm ci
watchman watch-del-all
rm -fr $TMPDIR/haste-map-*
rm -rf $TMPDIR/metro-cache
