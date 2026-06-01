import { useState, useCallback, useRef, useEffect } from 'react';

const MIC_KEY = 'iv_mic_id';
const SPK_KEY = 'iv_spk_id';

export function useAudioDevices() {
  const [inputs,     setInputs]     = useState([]);
  const [outputs,    setOutputs]    = useState([]);
  const [granted,    setGranted]    = useState(false);
  const [micId,      setMicId]      = useState(() => localStorage.getItem(MIC_KEY)     ?? '');
  const [speakerId,  setSpeakerId]  = useState(() => localStorage.getItem(SPK_KEY)     ?? '');
  const [micLevel,   setMicLevel]   = useState(0);
  const [testingMic, setTestingMic] = useState(false);
  const cleanupRef = useRef(null);

  // Enumerate on mount — labels appear if permission was previously granted
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then(devs => {
      if (devs.some(d => d.label)) setGranted(true);
      setInputs( devs.filter(d => d.kind === 'audioinput'));
      setOutputs(devs.filter(d => d.kind === 'audiooutput'));
    }).catch(() => {});
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setGranted(true);
      const devs = await navigator.mediaDevices.enumerateDevices();
      setInputs( devs.filter(d => d.kind === 'audioinput'));
      setOutputs(devs.filter(d => d.kind === 'audiooutput'));
    } catch { /* permission denied — inputs/outputs stay empty */ }
  }, []);

  const selectMic = useCallback((id) => {
    setMicId(id);
    localStorage.setItem(MIC_KEY, id);
  }, []);

  const selectSpeaker = useCallback((id) => {
    setSpeakerId(id);
    localStorage.setItem(SPK_KEY, id);
  }, []);

  const stopMicTest = useCallback(() => {
    cleanupRef.current?.();
  }, []);

  const testMic = useCallback(async () => {
    cleanupRef.current?.();
    setTestingMic(true);
    try {
      const audio    = micId ? { deviceId: { exact: micId } } : true;
      const stream   = await navigator.mediaDevices.getUserMedia({ audio });
      const ctx      = new AudioContext();
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const vol = Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 55);
        setMicLevel(vol);
        raf = requestAnimationFrame(tick);
      };
      tick();
      const cleanup = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach(t => t.stop());
        ctx.close().catch(() => {});
        setMicLevel(0);
        setTestingMic(false);
        cleanupRef.current = null;
      };
      cleanupRef.current = cleanup;
      setTimeout(cleanup, 5000);
    } catch {
      setTestingMic(false);
    }
  }, [micId]);

  const testSpeaker = useCallback(async () => {
    const ctx = new AudioContext();
    try {
      if (speakerId && ctx.setSinkId) await ctx.setSinkId(speakerId).catch(() => {});
      await ctx.resume();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.06);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.55);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.65);
      osc.onended = () => ctx.close().catch(() => {});
    } catch {
      ctx.close().catch(() => {});
    }
  }, [speakerId]);

  return {
    inputs, outputs, granted, micId, speakerId, micLevel, testingMic,
    requestPermission, selectMic, selectSpeaker, testMic, stopMicTest, testSpeaker,
  };
}
