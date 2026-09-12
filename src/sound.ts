export class Sound {
  private context:AudioContext|null=null;private noise:AudioBuffer|null=null;volume=.25;private last=0;
  unlock(){try{this.context??=new AudioContext();if(this.context.state==='suspended')void this.context.resume();if(!this.noise){this.noise=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}}catch{}}
  play(type:'shot'|'explosion'|'click'|'capture'|'produced',pan=0,weight=1){
    if(!this.context||!this.volume)return;const context=this.context,now=context.currentTime;if(type==='shot'&&now-this.last<.065)return;if(type==='shot')this.last=now;
    const battle=type==='shot'||type==='explosion',duration=type==='explosion'?.65:type==='shot'?.2:.13;
    const gain=context.createGain(),panner=context.createStereoPanner(),osc=context.createOscillator();panner.pan.value=Math.max(-1,Math.min(1,pan));gain.connect(panner);panner.connect(context.destination);
    osc.type=battle?'triangle':'sine';const freq=type==='explosion'?58:type==='shot'?110:type==='capture'?700:type==='produced'?470:360;
    osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(type==='capture'?1050:freq*.25,now+duration);gain.gain.setValueAtTime(this.volume*(battle?.2:.18)*Math.min(weight,1.5),now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);osc.connect(gain);osc.start(now);osc.stop(now+duration);
    if(battle&&this.noise){const noise=context.createBufferSource(),filter=context.createBiquadFilter();noise.buffer=this.noise;filter.type='lowpass';filter.frequency.setValueAtTime(type==='explosion'?550:1800,now);filter.frequency.exponentialRampToValueAtTime(100,now+duration);noise.connect(filter);filter.connect(gain);noise.start(now);noise.stop(now+duration);noise.onended=()=>{noise.disconnect();filter.disconnect();};}
    osc.onended=()=>{osc.disconnect();gain.disconnect();panner.disconnect();};
  }
}
