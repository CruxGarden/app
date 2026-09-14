// Fragment shader — GLSL ES. The canvas beside the code shows it live.
#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

void main() {
    vec2 st = gl_FragCoord.xy / u_resolution.xy;
    st.x *= u_resolution.x / u_resolution.y;
    float d = length(st - vec2(0.9, 0.5));
    float ring = smoothstep(0.02, 0.0, abs(sin(d * 18.0 - u_time * 1.4)) - 0.35);
    vec3 col = mix(vec3(0.05, 0.08, 0.07), vec3(0.37, 0.83, 0.70), ring);
    col += 0.15 * vec3(st.x, st.y, 0.6) * (1.0 - d);
    gl_FragColor = vec4(col, 1.0);
}
