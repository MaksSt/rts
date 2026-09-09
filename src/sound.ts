export class Sound {
  private context:AudioContext|null=null;volume=.25;private last=0;
  unlock(){try{this.context??=new AudioContext();if(this.context.state==='suspended')void this.context.resume();}catch{}}
  play(type:'shot'|'explosion'|'click'|'capture'|'produced'){
    if(!this.context||!this.volume)return;const now=this.context.currentTime;if(type==='shot'&&now-this.last<.09)return;if(type==='shot')this.last=now;
    const gain=this.context.createGain(),osc=this.context.createOscillator();osc.type=type==='shot'||type==='explosion'?'triangle':'sine';const freq=type==='explosion'?65:type==='shot'?130:type==='capture'?700:type==='produced'?470:360,duration=type==='explosion'?.45:type==='shot'?.16:.12;
    osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(type==='capture'?1000:freq*.35,now+duration);gain.gain.setValueAtTime(this.volume*(type==='shot'?.15:.25),now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);osc.connect(gain);gain.connect(this.context.destination);osc.start(now);osc.stop(now+duration);
  }
}
