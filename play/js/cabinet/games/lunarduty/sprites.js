// THE NODE · world 1 · LUNAR DUTY · sprites (port of the LunarDutySprites half of LunarDutyRenderer.cs).
// Split out from renderer.js so spec.js (the title art) can use them without an import cycle.
//
// palette indices: 0 void 1 dust 2 dustDim 3 dustDark 4 cyan 5 cyanDim 6 red 7 tan 8 tanDim
//                  9 magenta a magentaDim b white c redDim
import { PixelSprite } from '../../sdk/index.js';

export const Body = PixelSprite.fromRows(
    "..6..........555555...1b........",
    "..1.........54bb4445..11........",
    "..1........54b4111445.22........",
    "..1........5b4115b54511111......",
    "..1........544115554522222......",
    "..1........544411144522223......",
    "...7777777777777777777777777....",
    ".7771111111111111111111111777...",
    "67666666666666666666666666677b..",
    "7777777777777777777777777777722b",
    "7777777777777777777777777777773.",
    ".8888888888888888888888888888...",
    "..33333333333333333333333333....");

export const Wheels = [
    PixelSprite.fromRows("..3333..", ".322223.", "325b4523", "32455423", "32455423", "32544523", ".322223.", "..3333.."),
    PixelSprite.fromRows("..3333..", ".322223.", "32544523", "32455b23", "32455423", "32544523", ".322223.", "..3333.."),
    PixelSprite.fromRows("..3333..", ".322223.", "32544523", "32455423", "32455423", "3254b523", ".322223.", "..3333.."),
    PixelSprite.fromRows("..3333..", ".322223.", "32544523", "32455423", "32b55423", "32544523", ".322223.", "..3333.."),
];

export const Ufo = [
    PixelSprite.fromRows(
        "......bbbb......",
        ".....b44445.....",
        "....54b44445....",
        "..999999999999..",
        ".9b999b999b999b.",
        "9999999999999999",
        ".aaaaaaaaaaaaaa.",
        "...aa..aa..aa..."),
    PixelSprite.fromRows(
        "......bbbb......",
        ".....b44445.....",
        "....54b44445....",
        "..999999999999..",
        ".999b999b999b99.",
        "9999999999999999",
        ".aaaaaaaaaaaaaa.",
        "...aa..aa..aa..."),
];

export const Rock = PixelSprite.fromRows(
    "...3333...",
    "..311113..",
    ".31111123.",
    "3111112223",
    "3111122223",
    "3112222233",
    "3222222333",
    "3333333333");

export const BigRock = PixelSprite.fromRows(
    ".....33333....",
    "...311111113..",
    "..31222222223.",
    ".311bb2222223.",
    ".31b1122222223",
    "31111112222223",
    "31111111222223",
    "31111111122223",
    "31111111112223",
    "31111111111223",
    "31111111111123",
    "33333333333333");

export const Mine = PixelSprite.fromRows(
    "....66....",
    "...3113...",
    "..333333..",
    ".32322323.",
    "3333333333");

export const MineDark = PixelSprite.fromRows(
    "....cc....",
    "...3113...",
    "..333333..",
    ".32322323.",
    "3333333333");

export const Tank = PixelSprite.fromRows(
    "...........aaaaa........",
    "..........a99999a.......",
    "b11111111a99b9999a......",
    "222222222a9999999a......",
    "......aaaaaaaaaaaaaaaaa.",
    "....99999999999999999999",
    "...999bb9999999999999999",
    "...aaaaaaaaaaaaaaaaaaaaa",
    "...33333333333333333333.",
    "..3323323323323323323323",
    "..3332332332332332332332",
    "...33333333333333333333.",
    "....333333333333333333..");

export const Bomb = PixelSprite.fromRows(".99.", "9bb9", "9bb9", "a99a", ".aa.");
export const Shell = PixelSprite.fromRows(".999a.", "9bb99a", ".999a.");
export const Missile = PixelSprite.fromRows("bb", "b6", "66", "66", "c6", "c.");
export const Shot = PixelSprite.fromRows("c66bb", "c66bb");
export const Icon = PixelSprite.fromRows(
    "..6...44......",
    "..1..4444.11..",
    ".777777777777.",
    "77777777777777",
    ".888888888888.",
    ".343..343..343",
    "..3....3....3.");

export const WheelX = [5, 15, 25];     // wheel centres from the sprite's left edge
export const BodyTall = 17;            // wheel bottom to the top of the body sprite
export const BodyLeft = 15;            // sprite left edge = buggy centre - 15
