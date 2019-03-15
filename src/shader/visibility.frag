#version 330 core
layout(location = 0) out float visibility;

uniform sampler3D volumeTex;            //!< 3D texture handle
uniform sampler2D transferfunctionTex;  //!< 3D texture handle

uniform vec3 eyePos;            //!< camera / eye position in world coordinates
uniform vec3 bbMin;             //!< axes aligned bounding box min. corner
uniform vec3 bbMax;             //!< axes aligned bounding box max. corner

uniform int winWidth;           //!< width of the window in pixels
uniform int winHeight;          //!< height of the window in pixels

uniform float stepSize;         //!< distance between sample points between
                                //!< sample points in world coordinates
uniform float stepSizeVoxel;    //!< distance between sample points in voxels

#define M_PIH   1.570796
#define M_PI    3.141592
#define M_2PI   6.283185
#define EPS     0.000001

/*!
 *  \brief computes the output color with front to back compositing
 *
 *  \param input input color as RGBA vector
 *  \param c color of the blended element
 *  \param a alpha of the blended element
 *  \param tStep current step size over basis step size used to adjust the
 *               opacity contribution
 *
 *  \return output color as RGBA vector
 */
vec4 frontToBack(vec4 inRGBA, vec3 c, float a, float tStep)
{
    vec4 outRGBA;
    float adjustedAlpha = 0.f;

    adjustedAlpha = (1.f - pow(1.f - a, tStep));

    outRGBA.rgb = inRGBA.rgb + (1.f - inRGBA.a) * c * adjustedAlpha;
    outRGBA.a = inRGBA.a + (1.f - inRGBA.a) * adjustedAlpha;

    return outRGBA;
}

/*!
 *  \brief Intersects a ray with an AABB and returns the intersection points
 *
 *  Intersection test with axes-aligned bounding box according to the slab
 *  method; It relies on IEEE 754 floating-point properties (see elementwise
 *  inverse of rayDir vector).
 *
 *  \param rayOrig The origin of the ray
 *  \param rayDir The direction of the ray
 *  \param tNear Out: distance from ray origin to first intersection point
 *  \param tFar Out: distance from ray origin to second intersection point
 *  \return True if the ray intersects the bounding box
 */
bool intersectBoundingBox(
    vec3 rayOrig, vec3 rayDir, out float tNear, out float tFar)
{
    vec3 invR = vec3(1.0) / rayDir;
    vec3 tbot = invR * (bbMin - rayOrig);
    vec3 ttop = invR * (bbMax - rayOrig);

    vec3 tmin = min(ttop, tbot);
    vec3 tmax = max(ttop, tbot);

    float largestTMin = max(max(tmin.x, tmin.y), max(tmin.x, tmin.z));
    float smallestTMax = min(min(tmax.x, tmax.y), min(tmax.x, tmax.z));

    tNear = largestTMin;
    tFar = smallestTMax;

    return (smallestTMax > largestTMin);
}

/*!
 *  \brief Intersects a ray with an infinite plane
 *
 *  Intersection test of ray with plane based on:
 *  stackoverflow.com/questions/23975555/how-to-do-ray-plane-intersection
 *
 *  \param rayOrig The origin of the ray
 *  \param rayDir The direction of the ray
 *  \param planeBase The base point of the plane
 *  \param planeNormal The normal of the plane
 *  \param t Out: distance from ray origin to the intersection point
 *  \return True if the ray intersects the plane
 */
bool intersectPlane(
        vec3 rayOrig, vec3 rayDir, vec3 planeBase, vec3 planeNormal, out float t)
{
    bool intersect = false;
    t = 0.f;

    float denom = dot(rayDir, planeNormal);
    if (abs(denom) > EPS)
    {
        t = dot(planeBase - rayOrig, planeNormal) / denom;
        if (t >= EPS) intersect = true;
    }

    return intersect;
}

// ----------------------------------------------------------------------------
//   main
// ----------------------------------------------------------------------------
void main()
{
    vec4 color = vec4(0.f); //!< RGBA color of the fragment
    float value = 0.f;      //!< value sampled from the volume

    bool intersect = false; //!< flag if we did hit the bounding box
    float temp = 0.f;       //!< temporary variable
    vec3 volCoord = vec3(0.f);      //!< coordinates for texture access

    bool terminateEarly = false;    //!< early ray termination

    vec3 pos = vec3(0.f);   //!< current position on the ray in world
                            //!< coordinates
    float x = 0.f;          //!< distance from origin to current position
    float dx = stepSize;    //!< distance between sample points along the ray
    float tNear, tFar;      //!< near and far distances where the shot ray
                            //!< intersects the bounding box of the volume data

    vec3 rayOrig = eyePos;                          //!< origin of the ray
    vec3 rayDir = normalize(vWorldCoord - rayOrig); //!< direction of the ray


    // maximum intensity projection
    float maxValue = 0.f;

    // isosurface
    float valueLast = 0.f;          //!< temporary variable for storing the
                                    //!< last sample value
    vec3 posLast = rayOrig;         //!< temporary variable for storing the
                                    //!< last sampled position on the ray

    // transfer function
    vec4 tfColor = vec4(0.f);       //!< color value from the transferfunction

    // intersect with bounding box and handle special case when we are inside
    // the box. In this case the ray marching starts directly at the origin.
    volCoord = rayOrig - bbMin;
    if ((volCoord.x < bbMax.x) &&
        (volCoord.y < bbMax.y) &&
        (volCoord.z < bbMax.z))
    {
        // we are within the volume -> nevertheless make an intersection test
        // to get the exit point
        intersect = true;
        intersectBoundingBox(rayOrig, rayDir, temp, tFar);
        tNear = 0.f;
    }
    else
    {
        intersect = intersectBoundingBox(rayOrig, rayDir, tNear, tFar);
    }

    if (!intersect)
    {
        // we do not hit the volume
        fragColor = vec4(0.f);
        return;
    }
    else
    {
        // we do hit the volume -> check if it shall be sliced and update
        // the starting position accordingly
        if (sliceVolume)
        {
            if (intersectPlane(
                        rayOrig,
                        rayDir,
                        slicePlaneBase,
                        slicePlaneNormal,
                        temp))
            {
                // we intersect the slicing plane update the starting point
                // to show everything behind the plane
                tNear = temp;
            }
            else
                tNear = tFar + dx;
        }
    }

    // TODO: calculate voxel center position that corresponds to this
    // fragment and use it as starting position for the ray
    uvec2 pixelIdx(0,0);
    uvec3 volumeDim(0, 0, 0);
    vec3 voxelDim(1.f);

    uint linIdx = pixelIdx.x * pixelIdx.y;
    //vec3 voxelCoord(0.f, 0.f, 0.f);
    //voxelCoord.x = linIdx ...

    voxelPos.x = voxelDim.x * (((float) voxelIdx.x) + 0.5f)
    voxelPos.y = voxelDim.y * (((float) voxelIdx.y) + 0.5f)
    voxelPos.z = voxelDim.z * (((float) voxelIdx.z) + 0.5f)


    // TODO: as a test write linear idx to visibility and check if
    // array indices match raw data linear array position
    visibility = ((float) linIdx);

    // TODO: iterate until we leave the bounding box and check for visibility contribution
    pos = voxelPos;
    step = rayDir * stepSize;
    while ( (pos.x >= bbMin.x) && (pos.y >= bbMin.y) && (pos.z >= bbMin.z) &&
            (pos.x < bbMax.x) && (pos.y < bbMax.y) && (pos.z < bbMax.z) )
    {
        volCoord = (pos - bbMin) / (bbMax - bbMin);
        value = texture(volumeTex, volCoord).r;

        // transfer function
        // adapt this to sample in the middle of the transfer function
        tfColor = texture(transferfunctionTex, vec2(value, 0.5f));
        // TODO: change to back to front rendering
        color = frontToBack(color, tfColor.rgb, tfColor.a, stepSizeVoxel);



        // TODO: adapt this
        if (color.a > 0.99f)
            terminateEarly = true;

        if (terminateEarly)
            break;

        // Increment position on ray for next iteration
        pos += step;
    }
    /*
        // line-of-sight integration
        color.rgb += vec3(value * dx);
        color.a = 1.f;
        if (color.r > 0.99f)
        {
            if(ambientOcclusion)
            {
                pTexCoord = (pos - bbMin) / (bbMax - bbMin);
                n = -gradient(volumeTex, pTexCoord, dx, gradMethod);
                aoFactor = calcAmbientOcclussionFactor(
                    volumeTex,
                    pTexCoord,
                    n,
                    aoRadius,
                    aoSamples,
                    value);
                color.rgb = mix(
                    color.rgb, aoFactor * color.rgb, aoProportion);
            }
            terminateEarly = true;
        }

        // transfer function
        tfColor = texture(transferfunctionTex, vec2(value, 0.5f));
        // TODO: change to back to front rendering
        color = frontToBack(color, tfColor.rgb, tfColor.a, stepSizeVoxel);

        if (color.a > 0.99f)
            terminateEarly = true;

        if (terminateEarly)
            break;
    }

    visibility = 0.f;*/
}

