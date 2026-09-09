import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',globalSetup:'./tests/browser/setup.mjs',timeout:60000,workers:1,use:{baseURL:'http://127.0.0.1:5190',channel:'msedge',viewport:{width:1440,height:900},headless:true,launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']},screenshot:'only-on-failure'}});
