/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export function LogoSpinner() {
  return (
    <div className="flex items-center justify-center">
      <img
        src="/icbb-logo.png"
        alt="ICBB"
        className="h-10 w-10 object-contain animate-pulse"
      />
    </div>
  );
}
