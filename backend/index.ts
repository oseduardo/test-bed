/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import * as http2 from "http2";
import * as fs from "fs";
import * as path from "path";
import * as express from "express";
import * as bodyParser from "body-parser";
import * as WebSocket from "ws";

const mobilePort = process.env.MOBILE_PORT ? parseInt(process.env.MOBILE_PORT, 10) : 4000;
setupMobileMock();

import { IModelHost } from "@bentley/imodeljs-backend";
import { TestbedConfig, TestbedIpcMessage } from "../common/TestbedConfig";
import { TestRpcImpl, TestRpcImpl2, TestRpcImpl3, resetOp8Initializer, TestZeroMajorRpcImpl } from "./TestRpcImpl";
import { CONSTANTS } from "../common/Testbed";
import { RpcConfiguration, IModelReadRpcInterface, HttpServerRequest, HttpServerResponse } from "@bentley/imodeljs-common";
import { Logger, LogLevel } from "@bentley/bentleyjs-core";
import { IModelJsConfig } from "@bentley/config-loader/lib/IModelJsConfig";
import { Config } from "@bentley/imodeljs-clients";
IModelJsConfig.init(true, true, Config.App);
const compatibleVersion = IModelReadRpcInterface.version;

let pendingsSent = 0;
let pendingResponseQuota = 0;

RpcConfiguration.developmentMode = true;
TestbedConfig.mobilePort = mobilePort;

// tslint:disable-next-line:no-var-requires
const { ipcMain } = require("electron");
ipcMain.on("testbed", handleTestbedCommand);

// Start the backend
IModelHost.startup();

TestRpcImpl.register();
TestRpcImpl3.register();
TestZeroMajorRpcImpl.register();
TestbedConfig.initializeRpcBackend();

Logger.initializeToConsole();
Logger.setLevel("imodeljs-backend.IModelReadRpcImpl", LogLevel.Error);  // Change to trace to debug
Logger.setLevel("imodeljs-backend.IModelDb", LogLevel.Error);  // Change to trace to debug
Logger.setLevel("Performance", LogLevel.Error);  // Change to Info to capture

if (TestbedConfig.cloudRpc) {
  if (TestbedConfig.useHttp2) {
    const http2Options = { key: fs.readFileSync(path.join(__dirname, "../../local_dev_server.key")), cert: fs.readFileSync(path.join(__dirname, "../../local_dev_server.crt")) };
    http2.createSecureServer(http2Options, (req2, res2) => {
      if (req2.method === "GET") {
        handleHttp2Get(req2, res2);
      } else if (req2.method === "POST") {
        handleHttp2Post(req2, res2); // tslint:disable-line:no-floating-promises
      }
    }).listen(TestbedConfig.serverPort);
  } else {
    const app = express();
    app.use(bodyParser.text());
    app.use(bodyParser.raw());
    app.use(express.static(__dirname + "/public"));
    app.get(TestbedConfig.swaggerURI, (req, res) => TestbedConfig.cloudRpc.protocol.handleOpenApiDescriptionRequest(req, res));

    app.post("*", (req, res) => {
      if (handlePending(req, res)) {
        return;
      }

      TestbedConfig.cloudRpc.protocol.handleOperationPostRequest(req, res); // tslint:disable-line:no-floating-promises
    });

    app.get(/\/imodel\//, (req, res) => {
      TestbedConfig.cloudRpc.protocol.handleOperationGetRequest(req, res); // tslint:disable-line:no-floating-promises
    });

    app.listen(TestbedConfig.serverPort);
  }
}

function handleHttp2Get(req2: http2.Http2ServerRequest, res2: http2.Http2ServerResponse) {
  const { req, res } = wrapHttp2API(req2, res2);

  if (req2.url.indexOf("/v3/swagger.json") === 0) {
    TestbedConfig.cloudRpc.protocol.handleOpenApiDescriptionRequest(req, res);
  } else if (req2.url.match(/\/imodel\//)) {
    TestbedConfig.cloudRpc.protocol.handleOperationGetRequest(req, res); // tslint:disable-line:no-floating-promises
  } else {
    // serve static assets...
    const p = path.join(__dirname, "/public", req2.url); // FYI: path.join(...req.url) is NOT safe for a production server
    if (fs.existsSync(p)) {
      fs.createReadStream(p).pipe(req2.stream);
    } else {
      res2.statusCode = 404;
      res2.end("");
    }
  }
}

function handlePending(_req: HttpServerRequest, res: HttpServerResponse) {
  if (pendingResponseQuota && pendingsSent < pendingResponseQuota) {
    ++pendingsSent;
    res.status(202);
    res.set("Content-Type", "text/plain");
    res.send(`Pending Response #${pendingsSent}`);
    return true;
  } else {
    pendingsSent = 0;
    return false;
  }
}

async function handleHttp2Post(req2: http2.Http2ServerRequest, res2: http2.Http2ServerResponse) {
  const { req, res } = wrapHttp2API(req2, res2);

  if (handlePending(req, res)) {
    return;
  }

  try {
    req.body = await readHttp2Body(req2);
    TestbedConfig.cloudRpc.protocol.handleOperationPostRequest(req, res); // tslint:disable-line:no-floating-promises
  } catch (err) {
    res2.end(`Fatal testbed error: ${err.toString()}`);
  }
}

async function readHttp2Body(req2: http2.Http2ServerRequest) {
  return new Promise<string | Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req2.on("data", (chunk) => {
      chunks.push(chunk);
    }).on("end", () => {
      const body = Buffer.concat(chunks);
      resolve((req2.headers["content-type"] === "application/octet-stream") ? body : body.toString());
    }).on("error", (err) => {
      reject(err);
    });
  });
}

function wrapHttp2API(req2: http2.Http2ServerRequest, res2: http2.Http2ServerResponse) {
  const req: HttpServerRequest = req2 as any;
  const res: HttpServerResponse = res2 as any;

  req.path = req2.url;

  req.header = (field: string) => {
    const value = req2.headers[field.toLowerCase()];
    if (Array.isArray(value)) return value.join(",");
    return value;
  };

  res.send = (body?: any) => {
    res2.end(body);
    return res;
  };

  res.set = (field: string, value: string) => {
    res2.setHeader(field, value);
  };

  res.status = (code: number) => {
    res2.statusCode = code;
    return res;
  };

  return { req, res };
}

function handleTestbedCommand(event: any, arg: any) {
  const msg: TestbedIpcMessage = arg;
  if (msg.name === CONSTANTS.PENDING_RESPONSE_QUOTA_MESSAGE) {
    pendingResponseQuota = msg.value;
    pendingsSent = 0;
    event.returnValue = true;
  } else if (msg.name === CONSTANTS.REGISTER_TEST_RPCIMPL2_CLASS_MESSAGE) {
    TestRpcImpl2.register();
    TestRpcImpl2.instantiate();
    event.returnValue = true;
  } else if (msg.name === CONSTANTS.REPLACE_TEST_RPCIMPL2_INSTANCE_MESSAGE) {
    TestRpcImpl2.instantiate();
    event.returnValue = true;
  } else if (msg.name === CONSTANTS.UNREGISTER_TEST_RPCIMPL2_CLASS_MESSAGE) {
    TestRpcImpl2.unregister();
    event.returnValue = true;
  } else if (msg.name === CONSTANTS.SET_INCOMPATIBLE_INTERFACE_VERSION) {
    IModelReadRpcInterface.version = "0.0.0";
    event.returnValue = true;
  } else if (msg.name === CONSTANTS.RESTORE_COMPATIBLE_INTERFACE_VERSION) {
    IModelReadRpcInterface.version = compatibleVersion;
    event.returnValue = true;
  } else if (msg.name === CONSTANTS.RESTART_BACKEND) {
    IModelHost.shutdown();
    IModelHost.startup();
    event.returnValue = true;
  } else if (msg.name === CONSTANTS.RESET_OP8_INITIALIZER) {
    resetOp8Initializer();
    event.returnValue = true;
  }
}

function setupMobileMock() {
  const server = new WebSocket.Server({ port: mobilePort });
  let connection: WebSocket;

  const mobilegateway = {
    handler: (_payload: ArrayBuffer | string) => { throw new Error("Not implemented."); },

    sendString: (message: string) => {
      connection.send(message, (err) => {
        if (err) {
          throw err;
        }
      });
    },

    sendBinary: (message: Uint8Array) => {
      connection.send(Buffer.from(message), (err) => {
        if (err) {
          throw err;
        }
      });
    },

    port: mobilePort,
  };

  server.on("connection", (con) => {
    connection = con;
    con.on("message", (msg) => {
      if (Buffer.isBuffer(msg)) {
        const copy = Buffer.alloc(msg.length);
        msg.copy(copy);
        mobilegateway.handler(copy.buffer as ArrayBuffer);
      } else if (typeof (msg) === "string") {
        mobilegateway.handler(msg);
      }
    });
  });

  (global as any).self = global;
  (global as any).bentley = { imodeljs: { servicesTier: { require: () => mobilegateway } } };
}
