import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {createSecureOutboundProxy} from './secure-proxy.mjs';

test('secure proxy denies loopback HTTP targets', async () => {
  const proxy = await createSecureOutboundProxy();
  try {
    const status = await new Promise((resolve,reject) => {
      const req = http.request(proxy.url,{
        method:'GET',
        path:'http://127.0.0.1/',
        headers:{host:'127.0.0.1'}
      },res => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error',reject);
      req.end();
    });
    assert.equal(status,403);
  } finally {
    await proxy.close();
  }
});

test('secure proxy denies loopback CONNECT targets', async () => {
  const proxy = await createSecureOutboundProxy();
  try {
    const {port} = new URL(proxy.url);
    const firstLine = await new Promise((resolve,reject) => {
      const socket = net.connect({host:'127.0.0.1',port:Number(port)},() => {
        socket.write('CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\n\r\n');
      });
      socket.setEncoding('utf8');
      socket.on('data',data => {
        resolve(data.split('\r\n')[0]);
        socket.destroy();
      });
      socket.on('error',reject);
    });
    assert.match(firstLine,/403 Forbidden/);
  } finally {
    await proxy.close();
  }
});
