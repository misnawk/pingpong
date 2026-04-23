export const TABLE_WIDTH = 1.525;
export const TABLE_LENGTH = 2.74;
export const TABLE_HALF_WIDTH = TABLE_WIDTH / 2;
export const TABLE_HALF_LENGTH = TABLE_LENGTH / 2;
export const TABLE_CENTER_Y = 0.76;
export const TABLE_THICKNESS = 0.08;
export const TABLE_SURFACE_Y = TABLE_CENTER_Y + TABLE_THICKNESS / 2 + 0.002;
export const NET_HEIGHT = 0.1525;
export const NET_TOP_Y = TABLE_SURFACE_Y + NET_HEIGHT;
export const BALL_RADIUS = 0.04;
export const BALL_MASS = 0.0027;
export const TABLE_LINE_EPSILON = 0.018;
export const TABLE_INPUT_PADDING = 0.08;

export const PLAYER1 = 1;
export const PLAYER2 = 2;

export const PLAYER_PADDLE_Z = 2.0;
export const OPPONENT_PADDLE_Z = -1.8;
export const PLAYER_PADDLE_MIN_Z = TABLE_HALF_LENGTH + 0.02;
export const PLAYER_PADDLE_MAX_Z = 2.35;
export const OPPONENT_PADDLE_MIN_Z = -2.35;
export const OPPONENT_PADDLE_MAX_Z = -TABLE_HALF_LENGTH - 0.02;
export const PADDLE_COLLISION_Y = TABLE_SURFACE_Y + 0.1;
export const PLAYER_VISUAL_PADDLE_Y = 0.9;
export const OPPONENT_VISUAL_PADDLE_Y = 1.05;

export const SERVE_START_Z = TABLE_HALF_LENGTH - 0.09;
export const SERVE_HIT_Y = TABLE_SURFACE_Y + 0.36;
export const SERVE_HOLD_Y = TABLE_SURFACE_Y + 0.18;

export const CAMERA_POSITION = [0, 1.65, 3.1];
export const CAMERA_TARGET = [0, 0.85, -1.7];
export const CAMERA_FOV = 70;
