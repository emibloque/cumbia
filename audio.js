

class AudioSprite {
  constructor(arrayBuffer) {
    this.arrayBuffer = arrayBuffer;
    this.audioContext = new (AudioContext || webkitAudioContext)();
  }

  getChunk(fileName, start, end, fadeInLength, fadeOutLength, repeatTimes) {
    this.fileName = fileName;

    this.audioContext.decodeAudioData(this.arrayBuffer)
      .then(audioBuffer => {
        this.audioBuffer = audioBuffer;

        this.appendAudio(new FileCreator(this.audioBuffer, {
          offset: start,
          length: (end - start),
          fadeInLength: fadeInLength,
          fadeOutLength: fadeOutLength,
          repeatTimes: repeatTimes
        }).bufferToWave());

      });

  }

  appendAudio(wave) {
    var url = URL.createObjectURL(wave);
    var audio = new Audio(url);
    audio.controls = true;
    document.body.appendChild(audio);

    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', this.fileName + '.mp3');
    link.innerHTML = 'Download ' + this.fileName + '.mp3';
    document.body.appendChild(link);

  }
}





class FileCreator {
  constructor(audioBuffer, options = { offset: 0, length: 0, fadeInLength: 0, fadeOutLength: 0, repeatTimes: 1 }) {
    this.audioBuffer = audioBuffer;

    this.length = options.length * audioBuffer.sampleRate;
    this.initialOffset = options.offset * audioBuffer.sampleRate;
    this.fadeInLength = options.fadeInLength * audioBuffer.sampleRate;
    this.fadeOutLength = options.fadeOutLength * audioBuffer.sampleRate;
    this.repeatTimes = options.repeatTimes;

    this.destinationLength = this.length * this.repeatTimes * audioBuffer.numberOfChannels * 2 + WavBufferWriter.getHeadersSize();
  }

  getChannelsData() {
    let channels = [];
    for (let i = 0; i < this.audioBuffer.numberOfChannels; i++) {
      channels.push(this.audioBuffer.getChannelData(i));
    }
    return channels;
  }

  bufferToWave() {
    let channels = this.getChannelsData();

    let wavBufferWriter = new WavBufferWriter(this.destinationLength, this.audioBuffer.numberOfChannels, this.audioBuffer.sampleRate);
    wavBufferWriter.writeHeaders();


    let pointer = this.initialOffset;
    for (let j = 0; j < this.repeatTimes; j++) {
      while (this.isWritingChunk(wavBufferWriter, j)) {

        for (let i = 0; i < this.audioBuffer.numberOfChannels; i++) {
          let sample = this.getSample(channels[i], pointer);
          wavBufferWriter.setInt16(sample);
        }

        pointer++;
      }
      pointer = this.initialOffset;
    }

    return wavBufferWriter.getBlob();
  }

  isWritingChunk(writer, iteration) {
    let positionWithoutHeaders = writer.getPosition() - WavBufferWriter.getHeadersSize();
    let currentChunkLength = (this.destinationLength - WavBufferWriter.getHeadersSize()) / this.repeatTimes * (iteration + 1);
    return positionWithoutHeaders < currentChunkLength;
  }

  getSample(channel, pointer) {
    let sample = Math.max(-1, Math.min(1, channel[pointer])); // clamp
    return (0.5 + sample < 0 ? sample * 32768 : sample * 32767) * this.getVolume(pointer) | 0; // scale to 16-bit signed int
  }

  getVolume(pointer) {
    if (this.fadeInLength !== 0
      && pointer <= (this.initialOffset + this.fadeInLength)) {
      return (pointer - this.initialOffset) / this.fadeInLength;
    }

    if (this.fadeOutLength !== 0
      && (this.length + this.initialOffset - pointer) >= 0 
      && (this.length + this.initialOffset - pointer) <= this.fadeOutLength) {
      return (this.length + this.initialOffset - pointer) / this.fadeOutLength;
    }

    return 1;
  }
}





class BufferWriter {
  constructor(length) {
    this.position = 0;
    this.length = length;
    this.buffer = new ArrayBuffer(length);
    this.view = new DataView(this.buffer);
  }

  setInt16(data) {
    this.view.setInt16(this.position, data, true);
    this.position += 2;
  } 

  setUint16(data) {
    this.view.setUint16(this.position, data, true);
    this.position += 2;
  }

  setUint32(data) {
    this.view.setUint32(this.position, data, true);
    this.position += 4;
  }

  getPosition() {
    return this.position;
  }

  getBlob(options) {
    return new Blob([this.buffer], options);
  }
}






class WavBufferWriter extends BufferWriter {
  constructor(length, numberOfChannels, sampleRate) {
    super(length);
    this.numberOfChannels = numberOfChannels;
    this.sampleRate = sampleRate;
  }

  writeHeaders() {
    super.setUint32(0x46464952);                         // "RIFF"
    super.setUint32(super.length - 8);                         // file length - 8
    super.setUint32(0x45564157);                         // "WAVE"

    super.setUint32(0x20746d66);                         // "fmt " chunk
    super.setUint32(16);                                 // length = 16
    super.setUint16(1);                                  // PCM (uncompressed)
    super.setUint16(this.numberOfChannels);
    super.setUint32(this.sampleRate);
    super.setUint32(this.sampleRate * 2 * this.numberOfChannels); // avg. bytes/sec
    super.setUint16(this.numberOfChannels * 2);                      // block-align
    super.setUint16(16);                                 // 16-bit (hardcoded in this demo)

    super.setUint32(0x61746164);                         // "data" - chunk
    super.setUint32(super.length - super.position - 4);                   // chunk length
  }

  static getHeadersSize() {
    return 44;
  }

  getWavBlob() {
    return super.getBlob({type: "audio/wav"});
  }
}






