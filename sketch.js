// Bluetooth UUIDs for micro:bit UART service
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

let bluetoothDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isConnected = false;
let bluetoothStatus = "Disconnected";

let video;
let model = null;
let maxPredictions;
let pose = null;
let prediction = [];
let label = "wait";
let isClassifying = false;

let connectBluetoothButton, disconnectBluetoothButton;
let modelSelect, modelInput, initializeModelButton, stopClassifyButton;

const modelList = {
  "🧘앉기 |🧍일어서기": "r8wsgg5mm",
  "🙆O |🙅X": "YKdY8lyAQ",
  "🙋 팔모양": "Q5Ur108ke"
};

let isSendingData = false;

function setup() {
  let canvas = createCanvas(256, 256); 
  canvas.parent('p5-container');
  canvas.style('border-radius', '20px');

  setupCamera();
  createUI();
}

function setupCamera() {
  video = createCapture({
    video: {
      width: 256,
      height: 256
    }
  });
  video.size(256, 256); 
  video.hide();
}

function createUI() {
  connectBluetoothButton = createButton("🔗 블루투스 연결");
  connectBluetoothButton.parent('bluetooth-control-buttons');
  connectBluetoothButton.mousePressed(connectBluetooth);

  disconnectBluetoothButton = createButton("❌ 블루투스 연결 해제");
  disconnectBluetoothButton.parent('bluetooth-control-buttons');
  disconnectBluetoothButton.mousePressed(disconnectBluetooth);

  modelSelect = select('#modelSelect');
  modelSelect.option("모델을 선택하세요", "");
  for (const modelName in modelList) {
    modelSelect.option(modelName, modelList[modelName]);
  }
  modelSelect.changed(updateModelInput);

  modelInput = select('#modelInput');
  modelInput.value("");

  initializeModelButton = createButton('🟢 모델 로드');
  initializeModelButton.parent('model-action-buttons');
  initializeModelButton.id('initializeModelButton');
  initializeModelButton.mousePressed(initializeModel);

  stopClassifyButton = createButton('🔴 분류 중지');
  stopClassifyButton.parent('model-action-buttons');
  stopClassifyButton.id('stopClassifyButton');
  stopClassifyButton.mousePressed(stopClassification);

  updateBluetoothStatus();
}

function updateModelInput() {
  const selectedModelKey = modelSelect.value();
  modelInput.value(selectedModelKey || "");
}

async function connectBluetooth() {
  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "BBC micro:bit" }],
      optionalServices: [UART_SERVICE_UUID]
    });

    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE_UUID);
    rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
    txCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);

    txCharacteristic.startNotifications();
    txCharacteristic.addEventListener("characteristicvaluechanged", handleReceivedData);

    isConnected = true;
    bluetoothStatus = `Connected to ${bluetoothDevice.name}`;
  } catch (error) {
    console.error("Bluetooth connection failed:", error);
    bluetoothStatus = "Connection Failed";
  }
  updateBluetoothStatus();
}

function disconnectBluetooth() {
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
    isConnected = false;
    bluetoothStatus = "Disconnected";
    rxCharacteristic = null;
    txCharacteristic = null;
    bluetoothDevice = null;
  } else {
    bluetoothStatus = "Already Disconnected";
  }
  updateBluetoothStatus();
}

function updateBluetoothStatus() {
  const statusElement = select('#bluetoothStatus');
  statusElement.html(`상태: ${bluetoothStatus}`);
  if (bluetoothStatus.includes("Connected")) {
    statusElement.style('background-color', '#d0f0fd');
    statusElement.style('color', '#FE818D');
  } else {
    statusElement.style('background-color', '#f9f9f9');
    statusElement.style('color', '#FE818D');
  }
}

function handleReceivedData(event) {
  const receivedData = new Uint8Array(event.target.value.buffer);
  const receivedString = new TextDecoder().decode(receivedData);
  console.log("Received:", receivedString);
}

async function sendBluetoothData(data) {
  if (!rxCharacteristic || !isConnected) {
    console.error("Cannot send data: Device not connected.");
    return;
  }
  if (isSendingData) return;

  try {
    isSendingData = true;
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data + "\n");
    await rxCharacteristic.writeValue(encodedData);
    console.log("Sent:", data);
  } catch (error) {
    console.error("Error sending data:", error);
  } finally {
    isSendingData = false;
  }
}

function initializeModel() {
  const modelKey = modelInput.value().trim();
  if (!modelKey) {
    alert('모델 키를 입력하세요!');
    return;
  }
  const modelURL = `https://teachablemachine.withgoogle.com/models/${modelKey}/model.json`;
  const metadataURL = `https://teachablemachine.withgoogle.com/models/${modelKey}/metadata.json`;

  tmPose.load(modelURL, metadataURL).then(loadedModel => {
    model = loadedModel;
    maxPredictions = model.getTotalClasses();
    label = "wait";
    startClassification();
  }).catch(error => {
    console.error('모델 로드 실패:', error);
  });
}

function startClassification() {
  if (!model) return;
  isClassifying = true;
  classifyPose();
}

async function classifyPose() {
  if (!isClassifying) return;

  let tempCanvas = document.createElement('canvas');
  tempCanvas.width = 256;
  tempCanvas.height = 256;
  let tempCtx = tempCanvas.getContext('2d');
  tempCtx.translate(256, 0); 
  tempCtx.scale(-1, 1);    
  tempCtx.drawImage(video.elt, 0, 0, 256, 256);

  const { pose: detectedPose, posenetOutput } = await model.estimatePose(tempCanvas);
  pose = detectedPose;
  prediction = await model.predict(posenetOutput);

  if (prediction.length > 0) {
    const highestPrediction = prediction.reduce((prev, current) => {
      return (prev.probability > current.probability) ? prev : current;
    });

    label = highestPrediction.className;
    console.log("분류 결과:", label);
    sendBluetoothData(label);
  }
  requestAnimationFrame(classifyPose);
}

function stopClassification() {
  isClassifying = false;
  label = "stop";
  pose = null;
  sendBluetoothData("stop");
}

function draw() {
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0);
  pop();

  if (pose) {
    const minPartConfidence = 0.5;
    push();
    translate(width, 0); 
    scale(-1, 1);       
    translate(width, 0); 
    scale(-1, 1);       
    tmPose.drawKeypoints(pose.keypoints, minPartConfidence, drawingContext);
    tmPose.drawSkeleton(pose.keypoints, minPartConfidence, drawingContext);
    pop();
  }

  const boxWidth = 200;
  const boxHeight = 40;
  const boxX = width / 2 - boxWidth / 2;
  const boxY = height / 2 - boxHeight / 2;
  fill(50, 50, 50, 150);
  noStroke();
  rect(boxX, boxY, boxWidth, boxHeight, 10);
  textSize(24);
  textAlign(CENTER, CENTER);
  fill(255);
  text(label, width / 2, height / 2);
}
