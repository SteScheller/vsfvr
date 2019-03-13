#version 330 core
layout(location = 0) in vec2 in_position;

uniform mat4 projMX;    //!< projection matrix

void main()
{
    gl_Position = projMX * vec4(in_position, 0.f, 1.f);
}

