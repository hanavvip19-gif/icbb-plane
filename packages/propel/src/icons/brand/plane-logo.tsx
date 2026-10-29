/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

export function PlaneLogo({ width = "85", height = "52", className }: ISvgIcons) {
  return (
    <img
      src="/icbb-logo.png"
      alt="ICBB"
      width={width}
      height={height}
      className={`object-contain ${className ?? ""}`}
    />
  );
}
