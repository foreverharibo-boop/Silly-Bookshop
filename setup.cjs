'use strict';
const path=require('node:path');
if(!process.argv[2]) process.argv[2]=path.resolve(__dirname,'../../data/default-user');
require('./server/setup.cjs');
