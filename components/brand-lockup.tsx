import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import styles from "./brand-lockup.module.css";

export function BrandLockup() {
  return (
    <Link className={styles.link} href="/" aria-label="AI Teacher — início">
      <BrandLogo className={styles.logo} alt="" />
    </Link>
  );
}

export function MobileBrandLink() {
  return (
    <Link className={styles.mobileLink} href="/" aria-label="AI Teacher — início">
      <BrandLogo className={styles.mobileLogo} alt="" />
    </Link>
  );
}
