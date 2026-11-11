/** FIRST-CONTACT-001 | Public-number reproduction of AARO Go Fast Appendix A.
 * AARO case resolution (Feb. 2025), Appendix A, Table I and Eqs. 4-13.
 * NOT a fresh interpretation of raw FLIR footage. Original file and metadata
 * are unavailable, and all reconstructed numbers are rounded public values.
 * Coordinates are aircraft-aligned: +x forward, +y right, +z DOWN.
 * This differs from the ENU generic moving-platform solver.
 * Primary source: https://www.aaro.mil/Portals/136/PDFs/case_resolution_reports/AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf
 */
const rad=d=>d*Math.PI/180;
function lineOfSight({rangeMeters,sensorAzimuthLeftDegrees,sensorElevationDegrees,extraYawLeftDegrees=0}){
  const horizontal=rangeMeters*Math.cos(rad(sensorElevationDegrees));
  const direction=rad(-sensorAzimuthLeftDegrees-extraYawLeftDegrees);
  return {x:horizontal*Math.cos(direction),y:horizontal*Math.sin(direction),z:-rangeMeters*Math.sin(rad(sensorElevationDegrees))};
}
export function reconstructPublishedAppendixA(){
  // Table I lists 6297 m at t2. An adjacent paragraph says 6279 m, a source
  // inconsistency; Eq. (9) uses 6297 m. Prefer Table I and equation.
  const first={rangeMeters:7408,sensorAzimuthLeftDegrees:49,sensorElevationDegrees:-29};
  const second={rangeMeters:6297,sensorAzimuthLeftDegrees:57,sensorElevationDegrees:-35};
  const dtSeconds=13,speedAircraftMetersPerSecond=190,bankDegrees=14,g=9.81;
  const radius=speedAircraftMetersPerSecond**2/(g*Math.tan(rad(bankDegrees)));
  const turn=speedAircraftMetersPerSecond*dtSeconds/radius;
  const aircraftT2={x:radius*Math.sin(turn),y:-radius*(1-Math.cos(turn)),z:0};
  const objectT1=lineOfSight(first);
  const relativeT2=lineOfSight({...second,extraYawLeftDegrees:turn*180/Math.PI});
  const objectT2={x:aircraftT2.x+relativeT2.x,y:aircraftT2.y+relativeT2.y,z:relativeT2.z};
  const displacement={x:objectT2.x-objectT1.x,y:objectT2.y-objectT1.y,z:objectT2.z-objectT1.z};
  const chordDistanceMeters=Math.hypot(displacement.x,displacement.y,displacement.z);
  return {
    classification:"public_AARO_numbers_arithmetic_reproduction_not_original_telemetry",
    coordinateSystem:"aircraft_relative_x_forward_y_right_z_down",
    sourceFrames:[4239,4252],dtSeconds,
    aircraft:{turnRadiusMeters:radius,yawLeftDegrees:turn*180/Math.PI,positionT2Meters:aircraftT2},
    object:{positionT1Meters:objectT1,positionT2Meters:objectT2,displacementMeters:displacement,
      chordDistanceMeters,chordSpeedMetersPerSecond:chordDistanceMeters/dtSeconds,
      estimatedAltitudeT1Meters:7620-objectT1.z,estimatedAltitudeT2Meters:7623-objectT2.z},
    publishedRoundingComparison:{
      AAROFirstFrameApproxMeters:{x:4251,y:-4890,z:3591},
      AAROSecondFrameApproxMeters:{x:4510,y:-4941,z:3612},
      AARODistanceFromRoundedIntermediatesMeters:265,
      AAROApproxSpeedMetersPerSecond:20
    },
    limitations:[
      "Not independent analysis of the observed physical object",
      "No original video, calibrated platform heading or absolute track",
      "Approximation assumes constant bank angle and speed for 13 seconds",
      "Displayed values rounded; frame-transition data, fit coefficients and sensor calibration not evaluated",
      "No wind-compensated intrinsic speed computed",
      "This coordinate convention differs from the generic ENU solver"
    ]
  };
}
if(process.argv[1] && import.meta.url.endsWith("/"+process.argv[1].split("/").pop()))
  console.log(JSON.stringify(reconstructPublishedAppendixA(),null,2));
