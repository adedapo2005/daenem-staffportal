import { useEffect, useState, type ReactNode } from 'react';
import type { ErpId } from './module-hub';
import './module-experience-bridge.css';

export type ModuleExperienceContext = {
  moduleId?: string;
  erpId: ErpId;
  canonicalPath: string;
  layoutId: string;
  shellMode: string;
  density: string;
  motion: string;
};

type ExperienceWindow = Window & { __DAENEM_MODULE_EXPERIENCE__?: ModuleExperienceContext };

const fallbackFor = (erpId: ErpId): ModuleExperienceContext => ({
  erpId, canonicalPath: erpId + '/workspace', layoutId: 'executive-command',
  shellMode: 'command-rail', density: 'standard', motion: 'balanced',
});

function readExperience(erpId: ErpId) {
  const current = (window as ExperienceWindow).__DAENEM_MODULE_EXPERIENCE__;
  return current?.erpId === erpId ? current : fallbackFor(erpId);
}

export function useModuleExperience(erpId: ErpId) {
  const [experience, setExperience] = useState<ModuleExperienceContext>(() => readExperience(erpId));
  useEffect(() => {
    const onExperience = (event: Event) => {
      const detail = (event as CustomEvent<ModuleExperienceContext>).detail;
      if (detail?.erpId === erpId) setExperience(detail);
    };
    window.addEventListener('daenem:module-experience', onExperience);
    return () => window.removeEventListener('daenem:module-experience', onExperience);
  }, [erpId]);
  return experience;
}

export function ModuleExperienceEnvelope({ experience, children }: { experience: ModuleExperienceContext; children: ReactNode }) {
  return <div className={'module-experience-envelope module-experience-shell-' + experience.shellMode} data-module-experience="true" data-module-context-ready="true" data-module-layout={experience.layoutId} data-module-shell={experience.shellMode} data-module-erp={experience.erpId} data-module-path={experience.canonicalPath} data-module-density={experience.density} data-module-motion={experience.motion}>
    {children}
  </div>;
}
