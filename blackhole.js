// inspired by https://x.com/XorDev
(function() {
  const canvas = document.getElementById('glcanvas');
  const gl = canvas.getContext('webgl');
  if (!gl) {
    // Replaced alert with console.error as alerts are disallowed
    console.error("WebGL not supported");
    return;
  }

  // Vertex shader
  const vsSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  // Fragment shader
  const fsSource = `
    precision mediump float;
    uniform float t;
    uniform vec2 r;              // resolution
    uniform int u_trailCount;
    uniform vec4 u_trails[30];   // x, y, age, strength

    vec2 myTanh(vec2 x) {
      vec2 ex = exp(x);
      vec2 emx = exp(-x);
      return (ex - emx) / (ex + emx);
    }

    // --- STARFIELD CODE ---

    // 2D Random function
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    // This function creates one layer of parallax stars
    // - uv: The screen coordinate
    // - zoom: How dense/zoomed in this layer is
    // - speed: How fast this layer moves
    // - time: The global time uniform (t)
    float createStarLayer(vec2 uv, float zoom, float speed, float time) {
        // Scale and move the coordinates
        vec2 p = uv * zoom;
        p.x += time * speed; // This is what creates the movement

        // Use the integer part for grid cells, fractional for position in cell
        vec2 i = floor(p);
        vec2 f = fract(p);

        // Get a random value for this grid cell
        float rnd = random(i);

        // --- STAR DENSITY SET TO 0.67 ---
        // This is your requested setting.
        if (rnd > 0.67) {
            // Get a random offset to place the star *inside* the cell
            vec2 offset = vec2(random(i + 10.1), random(i + 20.2)) * 0.8 - 0.4;
            
            // Calculate distance from pixel to the star's center
            float dist = length(f - 0.5 - offset);

            // Make the star a small, soft dot
            // Brighter stars (higher rnd) will be slightly larger
            // Adjusted to '0.67' to match the new threshold
            float starSize = 0.01 + (rnd - 0.67) * 0.1; 
            float star = smoothstep(starSize, 0.0, dist);

            // Add twinkling
            // Each star twinkles at its own random rate
            star *= 0.6 + 0.4 * sin(rnd * 1000.0 + time * (rnd * 3.0 + 1.0));

            return star;
        }
        return 0.0;
    }
    
    // --- END STARFIELD CODE ---


    // Function to compute base blackhole color (same as before)
    vec4 getBlackholeColor(vec2 fragCoord) {
      vec4 o_bg = vec4(0.0);
      vec4 o_anim = vec4(0.0);

      // Background
      {
        vec2 p_img = (fragCoord * 2.0 - r) / r.y * mat2(1.0, -1.0, 1.0, 1.0);
        vec2 l_val = myTanh(p_img * 5.0 + 2.0);
        l_val = min(l_val, l_val * 3.0);
        vec2 clamped = clamp(l_val, -2.0, 0.0);
        float diff_y = clamped.y - l_val.y;
        float safe_px = abs(p_img.x) < 0.001 ? 0.001 : p_img.x;
        float term = (0.1 - max(0.01 - dot(p_img, p_img) / 200.0, 0.0) * (diff_y / safe_px))
                     / abs(length(p_img) - 0.7);
        o_bg += vec4(term);
        o_bg *= max(o_bg, vec4(0.0));
      }

      // Foreground animation
      {
        vec2 p_anim = (fragCoord * 2.0 - r) / r.y / 0.7;
        vec2 d = vec2(-1.0, 1.0);
        float denom = 0.1 + 5.0 / dot(5.0 * p_anim - d, 5.0 * p_anim - d);
        vec2 c = p_anim * mat2(1.0, 1.0, d.x / denom, d.y / denom);
        vec2 v = c;
        v *= mat2(cos(log(length(v)) + t * 0.2 + vec4(0.0, 33.0, 11.0, 0.0))) * 5.0;
        vec4 animAccum = vec4(0.0);
        for (int i = 1; i <= 9; i++) {
          float fi = float(i);
          animAccum += sin(vec4(v.x, v.y, v.y, v.x)) + vec4(1.0);
          v += 0.7 * sin(vec2(v.y, v.x) * fi + t) / fi + 0.5;
        }
        vec4 animTerm = 1.0 - exp(-exp(c.x * vec4(0.6, -0.4, -1.0, 0.0))
                          / animAccum
                          / (0.1 + 0.1 * pow(length(sin(v / 0.3) * 0.2 + c * vec2(1.0, 2.0)) - 1.0, 2.0))
                          / (1.0 + 7.0 * exp(0.3 * c.y - dot(c, c)))
                          / (0.03 + abs(length(p_anim) - 0.7)) * 0.2);
        o_anim += animTerm;
      }

      return clamp(mix(o_bg, o_anim, 0.5) * 1.5, 0.0, 1.0);
    }


    // --- Main function ---
    void main() {
      // Use r.y to keep aspect ratio, center horizontally
      vec2 uv = gl_FragCoord.xy / r.y;
      uv.x -= 0.5 * (r.x / r.y - 1.0);

      // 1. Get base blackhole color
      vec4 blackholeColor = getBlackholeColor(gl_FragCoord.xy);

      // 2. Get star layers (like your CSS example)
      // Layer 1 (Distant, dense, slow)
      float stars1 = createStarLayer(uv, 10.0, 0.02, t);
      // Layer 2 (Mid-ground, medium)
      float stars2 = createStarLayer(uv, 7.0, 0.05, t);
      // Layer 3 (Foreground, sparse, fast)
      float stars3 = createStarLayer(uv, 3.0, 0.1, t);
      
      vec4 starColor = vec4(stars1 + stars2 + stars3);

      // 3. Combine them. Use 'max' to punch stars through the black.
      vec4 finalColor = max(blackholeColor, starColor);

      // 4. Matter trails (fog-like extraction)
      // This logic is UNTOUCHED, but now adds on top of the stars+blackhole
      vec2 trail_uv = gl_FragCoord.xy / r; // Trails need 0-1 uv
      for (int i = 0; i < 30; i++) {
        if (i >= u_trailCount) break;
        vec4 tr = u_trails[i];
        vec2 pos = tr.xy;
        float age = tr.z;
        float strength = tr.w;

        // Distance from this fragment to trail center
        float dist = distance(trail_uv, pos);

        // Fog-like softness
        float fog = exp(-dist * 80.0) * exp(-age * 2.5);

        // Sample the blackhole color at the trail origin
        vec4 srcColor = getBlackholeColor(pos * r);

        // Blend that color into the trail (as if pulled away)
        finalColor.rgb += srcColor.rgb * fog * strength;
      }

      // Final output
      gl_FragColor = finalColor;
    }
  `;

  // Helpers
  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile failed: ' + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vsSource, fsSource) {
    const v = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const f = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram();
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program failed: ' + gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  const program = createProgram(gl, vsSource, fsSource);
  gl.useProgram(program);

  // Locations
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const timeLocation = gl.getUniformLocation(program, 't');
  const resolutionLocation = gl.getUniformLocation(program, 'r');
  const trailCountLoc = gl.getUniformLocation(program, 'u_trailCount');
  const trailsLoc = gl.getUniformLocation(program, 'u_trails');

  // Quad
  const vertices = new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Trail system ----
  let trails = [];
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    let mx = (e.clientX - rect.left) / canvas.width;
    let my = 1.0 - (e.clientY - rect.top) / canvas.height;

    // Only if inside blackhole radius
    let dx = mx - 0.5, dy = my - 0.5;
    let dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 0.45) {
      trails.push({x: mx, y: my, created: performance.now()/1000, strength: 0.6});
      if (trails.length > 30) trails.shift();
    }
  });

  let startTime = performance.now();
  
  // This is the corrected render loop (uses canvas.width/height)
  function render_corrected() {
    let now = performance.now()/1000;
    let delta = (performance.now() - startTime) / 1000;

    // Remove expired
    trails = trails.filter(t => now - t.created < 2.0);

    // Send uniforms
    gl.uniform1f(timeLocation, delta);
    // FIX: Use canvas.width and canvas.height
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height); 
    gl.uniform1i(trailCountLoc, trails.length);

    let flat = [];
    for (let t of trails) flat.push(t.x, t.y, now - t.created, t.strength);
    while (flat.length < 120) flat.push(0.0); // pad vec4[30]
    gl.uniform4fv(trailsLoc, flat);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render_corrected); // Call the corrected function
  }
  
  // Start the corrected render loop
  requestAnimationFrame(render_corrected);
})();

