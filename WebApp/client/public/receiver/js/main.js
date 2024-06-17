import { getServerConfig, getRTCConfiguration } from "../../js/config.js";
import { createDisplayStringArray } from "../../js/stats.js";
import { VideoPlayer } from "../../js/videoplayer.js";
import { RenderStreaming } from "../../module/renderstreaming.js";
import { Signaling, WebSocketSignaling } from "../../module/signaling.js";

/** @type {Element} */
let playButton;
let secondPlayButton;
/** @type {RenderStreaming} */
let renderstreaming;
let secondRenderStreaming;
/** @type {boolean} */
let useWebSocket;

const codecPreferences = document.getElementById('codecPreferences');
const supportsSetCodecPreferences = window.RTCRtpTransceiver &&
  'setCodecPreferences' in window.RTCRtpTransceiver.prototype;
const messageDiv = document.getElementById('message');
messageDiv.style.display = 'none';

const playerDiv = document.getElementById('player');
const secondPlayerDiv = document.getElementById('secondPlayer');
const lockMouseCheck = document.getElementById('lockMouseCheck');
const firstVideoPlayer = new VideoPlayer();
const secondVideoPlayer = new VideoPlayer();

setup();

window.document.oncontextmenu = function () {
  return false;     // cancel default menu
};

window.addEventListener('resize', function () {
  firstVideoPlayer.resizeVideo();
  
}, true);

window.addEventListener('beforeunload', async () => {
  if(!renderstreaming)
    return;
  await renderstreaming.stop();
}, true);

async function setup() {
  const res = await getServerConfig();
  useWebSocket = res.useWebSocket;
  showWarningIfNeeded(res.startupMode);
  showCodecSelect();
  showPlayButton(1);
  showPlayButton(2);
}

function showWarningIfNeeded(startupMode) {
  const warningDiv = document.getElementById("warning");
  if (startupMode == "private") {
    warningDiv.innerHTML = "<h4>Warning</h4> This sample is not working on Private Mode.";
    warningDiv.hidden = false;
  }
}

function showPlayButton(streamId) {
  if (!document.getElementById('playButton') && streamId == 1) {
    const elementPlayButton = document.createElement('img');
    elementPlayButton.id = 'playButton';
    elementPlayButton.src = '../../images/Play.png';
    elementPlayButton.alt = 'Start Streaming';
    playButton = document.getElementById('player').appendChild(elementPlayButton);
    playButton.addEventListener('click', onClickPlayButton);
  }

  if (!document.getElementById('secondPlayButton') && streamId == 2) {
    const secondElementPlayButton = document.createElement('img');
    secondElementPlayButton.id = 'secondPlayButton';
    secondElementPlayButton.src = '../../images/Play.png';
    secondElementPlayButton.alt = 'Start Streaming';
    // second player div
    secondPlayButton = document.getElementById('secondPlayer').appendChild(secondElementPlayButton);
    secondPlayButton.addEventListener('click', onSecondClickPlayButton);

  }
}

function onClickPlayButton() {
  playButton.style.display = 'none';

  // add video player
  firstVideoPlayer.createPlayer(playerDiv, lockMouseCheck);
  // videoPlayer.createPlayer(secondPlayerDiv, lockMouseCheck);
  setupRenderStreaming(1);
}

function onSecondClickPlayButton() {
  secondPlayButton.style.display = 'none';

  // add video player
  // videoPlayer.createPlayer(playerDiv, lockMouseCheck);
  secondVideoPlayer.createPlayer(secondPlayerDiv, lockMouseCheck);
  setupSecomndRenderStreaming(2);
}

async function setupSecomndRenderStreaming(streamId) {
  codecPreferences.disabled = true;
  console.log(streamId);
  const signaling = useWebSocket ? new WebSocketSignaling(streamId) : new Signaling();
  const config = getRTCConfiguration(streamId);
  secondRenderStreaming = new RenderStreaming(signaling, config);
  secondRenderStreaming.onConnect = createOnConnectHandler(streamId, secondRenderStreaming);
  secondRenderStreaming.onDisconnect = createOnDisconnectHandler(streamId, secondRenderStreaming);
  secondRenderStreaming.onTrackEvent = (data) => {
    if (streamId === 1) {
      firstVideoPlayer.addTrack(data.track);
    } else if (streamId === 2) {
      secondVideoPlayer.addTrack(data.track);
    }
  };

  secondRenderStreaming.onGotOffer = setCodecPreferences;

  await secondRenderStreaming.start();
  await secondRenderStreaming.createConnection();
}

async function setupRenderStreaming(streamId) {
  codecPreferences.disabled = true;
  console.log(streamId);
  const signaling = useWebSocket ? new WebSocketSignaling(streamId) : new Signaling();
  const config = getRTCConfiguration(streamId);
  renderstreaming = new RenderStreaming(signaling, config);
  renderstreaming.onConnect = createOnConnectHandler(streamId, renderstreaming);
  renderstreaming.onDisconnect = createOnDisconnectHandler(streamId, renderstreaming);
  renderstreaming.onTrackEvent = (data) => {
    if (streamId === 1) {
      firstVideoPlayer.addTrack(data.track);
    } else if (streamId === 2) {
      secondVideoPlayer.addTrack(data.track);
    }
  };

  renderstreaming.onGotOffer = setCodecPreferences;

  await renderstreaming.start();
  await renderstreaming.createConnection();
}

function createOnConnectHandler(streamId, renderstreaming) {
  return function() {
    const channel = renderstreaming.createDataChannel("input" + streamId);
    console.log("this is video player");
    if (streamId === 1) {
      firstVideoPlayer.setupInput(channel);
      console.log(firstVideoPlayer);
    } else if (streamId === 2) {
      secondVideoPlayer.setupInput(channel);
      console.log(secondVideoPlayer);
    }
    console.log("this is chanel");
    console.log(channel);
    
    showStatsMessage(renderstreaming);
  };
}


function createOnDisconnectHandler(streamId, renderstreaming) {
  return async function(connectionId) {
    clearStatsMessage();
    messageDiv.style.display = 'block';
    messageDiv.innerText = `Disconnect peer on ${connectionId}.`;

    await renderstreaming.stop();
    renderstreaming = null;

    if (streamId === 1) {
      firstVideoPlayer.deletePlayer();
    } else if (streamId === 2) {
      secondVideoPlayer.deletePlayer();
    }

    if (supportsSetCodecPreferences) {
      codecPreferences.disabled = false;
    }
    showPlayButton(streamId);
  };
}

function setCodecPreferences() {
  /** @type {RTCRtpCodecCapability[] | null} */
  let selectedCodecs = null;
  if (supportsSetCodecPreferences) {
    const preferredCodec = codecPreferences.options[codecPreferences.selectedIndex];
    if (preferredCodec.value !== '') {
      const [mimeType, sdpFmtpLine] = preferredCodec.value.split(' ');
      const { codecs } = RTCRtpSender.getCapabilities('video');
      const selectedCodecIndex = codecs.findIndex(c => c.mimeType === mimeType && c.sdpFmtpLine === sdpFmtpLine);
      const selectCodec = codecs[selectedCodecIndex];
      selectedCodecs = [selectCodec];
    }
  }

  if (selectedCodecs == null) {
    return;
  }
  const transceivers = renderstreaming.getTransceivers().filter(t => t.receiver.track.kind == "video");
  if (transceivers && transceivers.length > 0) {
    transceivers.forEach(t => t.setCodecPreferences(selectedCodecs));
  }
}

function showCodecSelect() {
  if (!supportsSetCodecPreferences) {
    messageDiv.style.display = 'block';
    messageDiv.innerHTML = `Current Browser does not support <a href="https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpTransceiver/setCodecPreferences">RTCRtpTransceiver.setCodecPreferences</a>.`;
    return;
  }

  const codecs = RTCRtpSender.getCapabilities('video').codecs;
  codecs.forEach(codec => {
    if (['video/red', 'video/ulpfec', 'video/rtx'].includes(codec.mimeType)) {
      return;
    }
    const option = document.createElement('option');
    option.value = (codec.mimeType + ' ' + (codec.sdpFmtpLine || '')).trim();
    option.innerText = option.value;
    codecPreferences.appendChild(option);
  });
  codecPreferences.disabled = false;
}

/** @type {RTCStatsReport} */
let lastStats;
/** @type {number} */
let intervalId;

function showStatsMessage(renderstreaming) {
  intervalId = setInterval(async () => {
    if (renderstreaming == null) {
      return;
    }

    const stats = await renderstreaming.getStats();
    if (stats == null) {
      return;
    }

    const array = createDisplayStringArray(stats, lastStats);
    if (array.length) {
      messageDiv.style.display = 'block';
      messageDiv.innerHTML = array.join('<br>');
    }
    lastStats = stats;
  }, 1000);
}

function clearStatsMessage() {
  if (intervalId) {
    clearInterval(intervalId);
  }
  lastStats = null;
  intervalId = null;
  messageDiv.style.display = 'none';
  messageDiv.innerHTML = '';
}