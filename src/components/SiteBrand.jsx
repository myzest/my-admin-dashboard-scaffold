import Image from 'next/image';
import { IconApps } from '@arco-design/web-react/icon';
import { site } from '@/config/site';

export default function SiteBrand({ iconClassName }) {
  return (
    <>
      <span className={iconClassName} aria-hidden="true">
        {site.logo ? (
          <Image
            src={site.logo}
            alt=""
            width={34}
            height={34}
            unoptimized
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <IconApps />
        )}
      </span>
      <span>{site.name}</span>
    </>
  );
}
