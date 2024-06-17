import {getServers} from "./icesettings.js";

export async function getServerConfig() {
  const protocolEndPoint = location.origin + '/config';
  const createResponse = await fetch(protocolEndPoint);
  return await createResponse.json();
}

export function getRTCConfiguration(streamId) {
  let config = {};
  config.sdpSemantics = 'unified-plan';
  config.iceServers = getServers(streamId);
  return config;
}
