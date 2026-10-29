/*
 * Simulador de maqueta: produce el mismo JSON que GET /telemetria y WS /ws (docs/API.md).
 * El robot "se pasea solo": avanza, gira, hace curvas y para. Los derivados son coherentes:
 * si camina, sube el torque y la temperatura; si frena, bajan y las cuatro patas quedan apoyadas.
 * No hay conexión real: es solo para mirar la maqueta funcionando.
 */
(function (global) {
  'use strict';

  var GO2_NAMES = ['FR_hip', 'FR_thigh', 'FR_calf', 'FL_hip', 'FL_thigh', 'FL_calf',
    'RR_hip', 'RR_thigh', 'RR_calf', 'RL_hip', 'RL_thigh', 'RL_calf'];
  var G1_NAMES = [
    'left_hip_pitch', 'left_hip_roll', 'left_hip_yaw', 'left_knee', 'left_ankle_pitch', 'left_ankle_roll',
    'right_hip_pitch', 'right_hip_roll', 'right_hip_yaw', 'right_knee', 'right_ankle_pitch', 'right_ankle_roll',
    'waist_yaw', 'waist_roll', 'waist_pitch',
    'left_shoulder_pitch', 'left_shoulder_roll', 'left_shoulder_yaw', 'left_elbow',
    'left_wrist_roll', 'left_wrist_pitch', 'left_wrist_yaw',
    'right_shoulder_pitch', 'right_shoulder_roll', 'right_shoulder_yaw', 'right_elbow',
    'right_wrist_roll', 'right_wrist_pitch', 'right_wrist_yaw'];
  var LEGS = ['FR', 'FL', 'RR', 'RL'];
  // Fase de trote: diagonales FR+RL y FL+RR alternadas.
  var LEG_PHASE = { FR: 0, RL: 0, FL: Math.PI, RR: Math.PI };

  // Recorrido en segundos: avanza, dobla, curva, para, gira, vuelve a avanzar.
  var ROUTE = [
    { until: 16, speed: 1, yawRate: 0 },
    { until: 21, speed: 0.6, yawRate: 24 },
    { until: 31, speed: 1, yawRate: -7 },
    { until: 39, speed: 0, yawRate: 0 },
    { until: 44, speed: 0.4, yawRate: -30 },
    { until: 52, speed: 1, yawRate: 0 }
  ];
  var ROUTE_LEN = 52;

  function rnd(a) { return (Math.random() - 0.5) * 2 * a; }
  function round(v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; }

  function Sim(opts) {
    opts = opts || {};
    this.listeners = [];
    this.statusListeners = [];
    this.transport = opts.transport || 'ws';
    this.pollMs = opts.pollMs || 500;
    this.paused = false;
    this.status = 'live';
    this.t = opts.startAt != null ? opts.startAt : 6;
    this.tick = 0;
    this.warmup = opts.warmup != null ? opts.warmup : 600;
    this.setModel(opts.modelo || 'go2');
    this.start();
  }

  Sim.prototype.setModel = function (modelo) {
    this.modelo = modelo;
    var names = modelo === 'g1' ? G1_NAMES : GO2_NAMES;
    this.motors = names.map(function (n, i) {
      var heat = 1, base = 34;
      if (modelo === 'go2') {
        if (/calf/.test(n)) { heat = 1.05; base = 52; }
        else if (/thigh/.test(n)) { heat = 0.9; base = 44; }
        else { heat = 0.8; base = 35; }
        if (n === 'RL_calf') { heat = 1.42; base = 60.6; }
        if (n === 'FR_calf') { heat = 1.12; base = 55.1; }
      } else {
        if (/knee|hip_pitch/.test(n)) { heat = 1.15; base = 49; }
        else if (/ankle/.test(n)) { heat = 1.0; base = 44; }
        else if (/waist/.test(n)) { heat = 0.8; base = 38; }
        else { heat = 0.55; base = 33; }
        if (n === 'left_knee') { heat = 1.7; base = 60.4; }
      }
      return { id: i, nombre: n, angulo: 0, velocidad: 0, torque: 0, temperatura: base + rnd(0.8), heat: heat, prevAngle: null };
    });
    this.cells = (modelo === 'g1' ? 13 : 8);
    this.cellOffsets = [];
    for (var c = 0; c < this.cells; c++) this.cellOffsets.push(rnd(0.012));
    this.cellOffsets[modelo === 'g1' ? 9 : 5] = -0.041; // una celda un poco más baja
    this.soc = 87.4;
    this.batTemp = 31.2;
    this.yaw = 78.2;
    this.speed = 1;
    this.yawRate = 0;
    this.gaitPhase = 0;
    this.last = null;
    this.history = [];
    // Precalienta: simula los últimos minutos para que los gráficos arranquen con historia.
    var t0 = this.t;
    this.t = t0 - this.warmup * 0.1;
    this._silent = true;
    for (var k = 0; k < this.warmup; k++) this.step(0.1);
    this._silent = false;
  };

  Sim.prototype.on = function (fn) { this.listeners.push(fn); if (this.last) fn(this.last); };
  Sim.prototype.onStatus = function (fn) { this.statusListeners.push(fn); fn(this.status, this); };
  Sim.prototype._setStatus = function (s) {
    this.status = s;
    var self = this;
    this.statusListeners.forEach(function (f) { f(s, self); });
  };
  Sim.prototype.setTransport = function (tr) { this.transport = tr; this._setStatus(this.status); };
  Sim.prototype.setPaused = function (p) { this.paused = p; this._setStatus(p ? 'paused' : 'live'); };
  Sim.prototype.togglePaused = function () { this.setPaused(!this.paused); };
  // Simula un corte de enlace: unos segundos sin datos, después reconecta.
  Sim.prototype.drop = function (secs) {
    var self = this;
    this._setStatus('lost');
    clearTimeout(this._dropT);
    this._dropT = setTimeout(function () {
      self._setStatus('reconnecting');
      self._dropT = setTimeout(function () { self._setStatus(self.paused ? 'paused' : 'live'); }, 1400);
    }, (secs || 4) * 1000);
  };
  Sim.prototype.hz = function () { return this.transport === 'ws' ? 10 : 1000 / this.pollMs; };
  Sim.prototype.latency = function () {
    return this.transport === 'ws' ? Math.round(14 + Math.random() * 9) : Math.round(this.pollMs / 2 + 18 + Math.random() * 20);
  };

  Sim.prototype.start = function () {
    var self = this;
    clearInterval(this._iv);
    this._iv = setInterval(function () { self.step(0.1); }, 100);
    this.step(0.1);
  };

  Sim.prototype.step = function (dt) {
    this.t += dt;
    this.tick++;
    var tr = ((this.t % ROUTE_LEN) + ROUTE_LEN) % ROUTE_LEN, seg = ROUTE[ROUTE.length - 1];
    for (var i = 0; i < ROUTE.length; i++) { if (tr < ROUTE[i].until) { seg = ROUTE[i]; break; } }
    // Transiciones suaves de velocidad y giro.
    this.speed += (seg.speed - this.speed) * Math.min(1, dt * 2.2);
    this.yawRate += (seg.yawRate - this.yawRate) * Math.min(1, dt * 2.5);
    this.yaw = ((this.yaw + this.yawRate * dt) % 360 + 360) % 360;
    var gaitF = 1.25; // Hz (trote lento, legible a 10 muestras por segundo)
    this.gaitPhase += 2 * Math.PI * gaitF * dt * (this.speed > 0.05 ? 1 : 0);
    var amp = this.speed;
    var t = this.t, self = this;
    var walking = amp > 0.12;

    var fuerzas = {};
    if (this.modelo === 'go2') {
      LEGS.forEach(function (leg) {
        var s = Math.sin(self.gaitPhase + LEG_PHASE[leg]);
        fuerzas[leg] = (!walking || s > -0.25) ? 1 : 0;
      });
    }

    this.motors.forEach(function (m) {
      var ang, torque;
      if (self.modelo === 'go2') {
        var leg = m.nombre.slice(0, 2), ph = self.gaitPhase + LEG_PHASE[leg];
        var stance = fuerzas[leg] === 1;
        var side = (leg === 'FR' || leg === 'RR') ? -1 : 1;
        if (/hip/.test(m.nombre)) {
          ang = side * (2.5 + amp * 3 * Math.sin(ph)) + self.yawRate * 0.06 * side;
          torque = 1.2 + amp * (stance ? 2.6 : 1.1) + Math.abs(self.yawRate) * 0.05;
        } else if (/thigh/.test(m.nombre)) {
          ang = 46 + amp * 13 * Math.sin(ph);
          torque = 3.6 + amp * (stance ? 6.5 : 2.2);
        } else {
          ang = -92 + amp * 17 * Math.max(-0.3, Math.cos(ph));
          torque = 6.8 + amp * (stance ? 10.5 : 2.6);
        }
      } else {
        var leftSide = /^left/.test(m.nombre) ? 0 : Math.PI;
        var ph2 = self.gaitPhase * 0.6 + leftSide;
        if (/knee/.test(m.nombre)) { ang = 22 + amp * 26 * Math.max(0, Math.sin(ph2)); torque = 8 + amp * 9; }
        else if (/hip_pitch/.test(m.nombre)) { ang = -12 + amp * 18 * Math.sin(ph2); torque = 6 + amp * 8; }
        else if (/ankle/.test(m.nombre)) { ang = -8 + amp * 10 * Math.sin(ph2 + 1); torque = 4 + amp * 6; }
        else if (/shoulder_pitch/.test(m.nombre)) { ang = 15 - amp * 20 * Math.sin(ph2); torque = 1.6 + amp * 1.5; }
        else if (/waist/.test(m.nombre)) { ang = amp * 4 * Math.sin(ph2) + self.yawRate * 0.1; torque = 3 + amp * 3; }
        else { ang = 4 + amp * 3 * Math.sin(ph2 + m.id); torque = 1 + amp * 0.9; }
      }
      ang += rnd(0.15);
      torque = Math.max(0.4, torque + rnd(0.35));
      var vel = m.prevAngle == null ? 0 : ((ang - m.prevAngle) * Math.PI / 180) / dt;
      m.prevAngle = ang;
      // Térmica: sube con el esfuerzo, baja al frenar. Constante de tiempo ~45 s.
      var target = 30 + 0.17 * m.heat * torque * torque * (self.modelo === 'g1' ? 0.42 : 0.85);
      m.temperatura += (target - m.temperatura) * dt / 45;
      m.angulo = ang; m.velocidad = vel; m.torque = torque;
    });

    var swayR = walking ? 1.5 * amp * Math.sin(this.gaitPhase) : 0;
    var swayP = walking ? 0.9 * amp * Math.sin(this.gaitPhase + 1.2) : 0;
    var roll = swayR - this.yawRate * 0.045 + rnd(0.12) - 0.3;
    var pitch = swayP - 0.8 * amp + rnd(0.1) - 0.4;

    var current = -(walking ? 4300 + 900 * amp : 1150) + rnd(160);
    this.soc = Math.max(5, this.soc - (walking ? 0.0016 : 0.0006));
    this.batTemp += ((walking ? 36 : 31) - this.batTemp) * dt / 120;
    var cellBase = 3.62 + this.soc / 100 * 0.5;
    var celdas = this.cellOffsets.map(function (o) { return round(cellBase + o + rnd(0.002), 3); });

    var frame = {
      modelo: this.modelo,
      ts: round(this.t, 2),
      motores: this.motors.map(function (m) {
        return { id: m.id, nombre: m.nombre, angulo: round(m.angulo, 2), velocidad: round(m.velocidad, 3),
          torque: round(m.torque, 2), temperatura: round(m.temperatura, 1) };
      }),
      imu: { roll: round(roll, 2), pitch: round(pitch, 2), yaw: round(this.yaw, 1),
        ax: round(rnd(0.08) + amp * 0.12 * Math.sin(this.gaitPhase), 3),
        ay: round(rnd(0.05) + this.yawRate * 0.004, 3),
        az: round(9.79 + (walking ? 0.35 * Math.sin(this.gaitPhase) : 0) + rnd(0.02), 3) },
      bms: { soc: Math.round(this.soc), corriente: Math.round(current), temperatura: round(this.batTemp, 1), celdas: celdas },
      fuerzas: fuerzas
    };
    this.last = frame;
    this.history.push(frame);
    if (this.history.length > 600) this.history.shift();
    if (this._silent) return;
    // WebSocket: cada paso (~10 Hz). Polling: cada pollMs.
    if (this.paused || this.status === 'lost' || this.status === 'reconnecting') return;
    var every = this.transport === 'ws' ? 1 : Math.max(1, Math.round(this.pollMs / 100));
    if (this.tick % every !== 0) return;
    this.listeners.forEach(function (f) { f(frame); });
  };

  /* ---------- Lo que el dashboard deduce (no lo pide) ---------- */
  var T = {};
  T.semaforo = function (temp) { return temp > 60 ? 'hot' : temp >= 40 ? 'warn' : 'ok'; };
  T.fmt = function (v, d) {
    if (v == null || isNaN(v)) return '—';
    var s = Math.abs(v).toFixed(d == null ? 1 : d).replace('.', ',');
    return (v < 0 && Number(s.replace(',', '.')) !== 0 ? '−' : '') + s;
  };
  T.signed = function (v, d) { var s = T.fmt(v, d); return v > 0 ? '+' + s : s; };
  T.analyze = function (f) {
    var vels = f.motores.reduce(function (a, m) { return a + Math.abs(m.velocidad); }, 0) / f.motores.length;
    var hottest = f.motores.reduce(function (a, m) { return m.temperatura > a.temperatura ? m : a; }, f.motores[0]);
    var maxTorque = f.motores.reduce(function (a, m) { return m.torque > a.torque ? m : a; }, f.motores[0]);
    var hot = f.motores.filter(function (m) { return m.temperatura > 60; });
    var warn = f.motores.filter(function (m) { return m.temperatura >= 40 && m.temperatura <= 60; });
    var cells = f.bms.celdas || [];
    var cmin = Math.min.apply(null, cells), cmax = Math.max.apply(null, cells);
    var alarms = hot.map(function (m) { return { level: 'hot', kind: 'motor', motor: m.nombre, text: m.nombre + ' a ' + T.fmt(m.temperatura, 1) + ' °C', detail: 'Supera 60 °C' }; });
    if (f.bms.soc < 20) alarms.push({ level: 'hot', kind: 'bms', text: 'Batería baja: ' + f.bms.soc + ' %', detail: 'Menos de 20 %' });
    var feet = f.fuerzas || {};
    var down = Object.keys(feet).filter(function (k) { return feet[k] === 1; });
    return {
      walking: vels > 0.35,
      moveIndex: vels,
      turning: Math.abs(f.imu.ay) > 0.06,
      hottest: hottest, maxTorque: maxTorque, hot: hot, warn: warn,
      cellMin: cmin, cellMax: cmax, cellDelta: cmax - cmin,
      alarms: alarms, feetDown: down, hasFeet: Object.keys(feet).length > 0
    };
  };
  T.legOf = function (name) { var p = name.slice(0, 2); return ['FR', 'FL', 'RR', 'RL'].indexOf(p) >= 0 ? p : null; };
  T.groupG1 = function (name) {
    if (/^left_(hip|knee|ankle)/.test(name)) return 'Pierna izquierda';
    if (/^right_(hip|knee|ankle)/.test(name)) return 'Pierna derecha';
    if (/^waist/.test(name)) return 'Cintura';
    if (/^left/.test(name)) return 'Brazo izquierdo';
    return 'Brazo derecho';
  };
  T.LEG_NAMES = { FR: 'Delantera derecha', FL: 'Delantera izquierda', RR: 'Trasera derecha', RL: 'Trasera izquierda' };

  /* ---------- Capturas y CSV ---------- */
  T.toCSV = function (samples) {
    if (!samples.length) return '';
    var f0 = samples[0].frame;
    var head = ['capturada', 'ts', 'modelo'];
    f0.motores.forEach(function (m) {
      head.push(m.nombre + '_angulo_deg', m.nombre + '_velocidad_rads', m.nombre + '_torque_Nm', m.nombre + '_temperatura_C');
    });
    head.push('imu_roll_deg', 'imu_pitch_deg', 'imu_yaw_deg', 'imu_ax', 'imu_ay', 'imu_az',
      'bms_soc_pct', 'bms_corriente_mA', 'bms_temperatura_C');
    (f0.bms.celdas || []).forEach(function (_, i) { head.push('bms_celda_' + (i + 1) + '_V'); });
    var legs = Object.keys(f0.fuerzas || {});
    legs.forEach(function (l) { head.push('pata_' + l); });
    var rows = [head.join(',')];
    samples.forEach(function (s) {
      var f = s.frame, r = [s.at.toISOString(), f.ts, f.modelo];
      f.motores.forEach(function (m) { r.push(m.angulo, m.velocidad, m.torque, m.temperatura); });
      r.push(f.imu.roll, f.imu.pitch, f.imu.yaw, f.imu.ax, f.imu.ay, f.imu.az, f.bms.soc, f.bms.corriente, f.bms.temperatura);
      (f.bms.celdas || []).forEach(function (c) { r.push(c); });
      legs.forEach(function (l) { r.push(f.fuerzas[l]); });
      rows.push(r.join(','));
    });
    return rows.join('\n') + '\n';
  };
  T.download = function (samples) {
    if (!samples.length) return null;
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    var name = 'telemetria-' + samples[0].frame.modelo + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.csv';
    var blob = new Blob([T.toCSV(samples)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    return name;
  };
  T.clock = function (d) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  };
  T.reducedMotion = function () { return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; };

  /* ---------- Tema: claro u oscuro, con tecla T ---------- */
  T.initTheme = function (defaultTheme) {
    var saved = null;
    try { saved = localStorage.getItem('unitree-theme'); } catch (e) { /* sin almacenamiento */ }
    document.documentElement.setAttribute('data-theme', saved || defaultTheme);
  };
  T.toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', cur);
    try { localStorage.setItem('unitree-theme', cur); } catch (e) { /* sin almacenamiento */ }
    return cur;
  };

  global.UnitreeSim = Sim;
  global.Tele = T;
})(window);
