#version 330 core
layout(location = 0) in vec2 in_position;
layout(location = 1) in vec2 tex_coords;

uniform mat4 projMX;    //!< projection matrix

uniform float x_min;    //!< lower limit of the shown interval
uniform float x_max;    //!< upper limit of the shown interval

uniform float tf_interval_lower;    //!< lower limit of the transfer function
                                    //!< definition interval
uniform float tf_interval_upper;    //!< upper limit of the transfer function
                                    //!< definition interval

out vec2 vTfTexCoord;   //!< texture coordinates for sampling the transfer
                        //!< function. Normalized such that
                        //!< whole definition interval
out vec2 vQuadCoord;    //!< position within the drawn quad

void main()
{
    gl_Position = projMX * vec4(in_position, 0.f, 1.f);

    vTfTexCoord.x =
        (mix(x_min, x_max, tex_coords.x) - tf_interval_lower) /
        (tf_interval_upper - tf_interval_lower);

    vTfTexCoord.y = 0.5f;

    // y is flipped for use of texture in ImGui Image
    vQuadCoord = vec2(tex_coords.x, 1.f - tex_coords.y);
}
