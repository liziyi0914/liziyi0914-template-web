import { Icon } from '@iconify/react';
import type { TreeDataNode } from 'antd';
import axios from 'axios';
import { instance } from '@/lib/api.ts';
import type { CompanyStructureDepartmentVO } from '@/lib/types.ts';

/**
 * 将 CompanyStructureDepartmentVO 数组转换为 TreeDataNode 树结构
 * @param departments 部门数组
 * @param parentId 父级部门ID，根节点为 null 或 undefined
 * @param allowTypes
 * @param bannedValues
 * @returns TreeDataNode 树结构
 */
export function convertDepartmentsToTreeData(
  departments: CompanyStructureDepartmentVO[],
  parentId: string | null | undefined = null,
  allowTypes: Array<'department' | 'position'> = ['department', 'position'],
  bannedValues: Array<string> = [],
): TreeDataNode[] {
  return departments
    .filter((department) => (department.parent || null) === parentId)
    .map((department) => {
      const children = convertDepartmentsToTreeData(
        departments,
        department.id,
        allowTypes,
        bannedValues,
      );

      const node: TreeDataNode = {
        title: department.name,
        key: `department.${department.id}`,
        // @ts-expect-error
        value: department.id,
        icon: (
          <div className="h-full flex justify-center items-center">
            <Icon icon="lucide:users-round" />
          </div>
        ),
        children: [
          ...(children.length > 0 ? children : []),
          ...(department.positions?.map((position) => ({
            title: position.name,
            key: `position.${position.id}`,
            value: position.id,
            selectable: allowTypes.includes('position'),
            disabled:
              bannedValues.includes(position.id) ||
              !allowTypes.includes('position'),
          })) ?? []),
        ],
        selectable: allowTypes.includes('department'),
        disabled:
          bannedValues.includes(department.id) ||
          !allowTypes.includes('department'),
      };

      return node;
    });
}

export function validateIdCard(id: string) {
  // 1. 检查长度是否为18位
  if (id.length !== 18) return false;

  // 2. 检查前17位是否为数字，最后一位为数字或X（大小写均可）
  if (!/^\d{17}[\dXx]$/.test(id)) return false;

  // 3. 提取并验证出生日期
  const year = parseInt(id.substr(6, 4));
  const month = parseInt(id.substr(10, 2));
  const day = parseInt(id.substr(12, 2));

  // 基础月份天数（2月暂按28天处理）
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // 处理闰年：能被4整除且不被100整除，或能被400整除
  if ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) {
    daysInMonth[1] = 29; // 闰年2月29天
  }

  // 验证月份和日期有效性
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth[month - 1]) return false;

  // 4. 验证校验码
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(id[i]) * weights[i];
  }

  const mod = sum % 11;
  const lastChar = id[17].toUpperCase(); // 统一转大写

  return lastChar === checkCodes[mod];
}

export function validateUnifiedSocialCreditCode(code: string): boolean {
  // 转换为大写并检查长度
  code = code.toUpperCase();
  if (code.length !== 18) {
    return false;
  }

  // 定义允许的字符集（0-9和A-Y，排除I、O、Z、S、V）
  const allowedChars = '0123456789ABCDEFGHJKLMNPQRTUWXY';

  // 检查所有字符是否在允许范围内
  for (let i = 0; i < 18; i++) {
    if (!allowedChars.includes(code[i])) {
      return false;
    }
  }

  // 权重系数数组（3^(i-1) mod 31）
  const weights = [
    1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28,
  ];

  // 计算加权和
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const char = code[i];
    const value = allowedChars.indexOf(char);
    sum += value * weights[i];
  }

  // 计算校验码
  const remainder = sum % 31;
  const checkValue = (31 - remainder) % 31;
  const checkChar = allowedChars[checkValue];

  // 比较计算出的校验码与实际第18位
  return code[17] === checkChar;
}

export function download(url: string, filename?: string, jsDownload?: boolean) {
  if (jsDownload) {
    new Promise(async () => {
      const response = await axios.get(url, {
        responseType: 'blob',
      });

      let name = filename;
      if (!name) {
        name = 'download';
        const disposition = response.headers['content-disposition'];

        if (disposition) {
          const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(
            disposition,
          );
          if (matches && matches[1]) {
            name = matches[1].replace(/['"]/g, '');
          }

          if (disposition.includes('filename*=UTF-8')) {
            const utf8Match = /filename\*=UTF-8''(.+)/i.exec(disposition);
            if (utf8Match && utf8Match[1]) {
              name = decodeURIComponent(utf8Match[1]);
            }
          }
        }
      }

      const blob = new Blob([response.data], {
        type: response.data.type,
      });
      const downloadUrl = window.URL.createObjectURL(blob);

      download(downloadUrl, filename);

      // 4. 清理
      window.URL.revokeObjectURL(downloadUrl);
    }).then();
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  if (filename) {
    link.download = filename;
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function runTemplate(
  templateId: string,
  list: Array<Record<string, any>>,
) {
  try {
    const response = await instance.post(
      `/common/templates/${templateId}`,
      {
        list: list,
      },
      {
        responseType: 'blob',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    if (response.headers['content-type'] === 'application/json') {
      console.error('模板执行失败', response);
      throw new Error('模板执行失败');
    }

    // 处理文件名（兼容多种格式）
    let filename = 'download';
    const disposition = response.headers['content-disposition'];

    if (disposition) {
      const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(
        disposition,
      );
      if (matches && matches[1]) {
        filename = matches[1].replace(/['"]/g, '');
      }

      if (disposition.includes('filename*=UTF-8')) {
        const utf8Match = /filename\*=UTF-8''(.+)/i.exec(disposition);
        if (utf8Match && utf8Match[1]) {
          filename = decodeURIComponent(utf8Match[1]);
        }
      }
    }

    // 3. 创建 Blob URL 并触发下载
    const blob = new Blob([response.data], {
      type: response.data.type,
    });
    const downloadUrl = window.URL.createObjectURL(blob);

    download(downloadUrl, filename);

    // 4. 清理
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('下载文件失败:', error);
    throw new Error(`下载文件失败: ${(error as Error).message}`);
  }
}

export function columnIdBase(
  name: Array<string>,
  version: string,
  path: Array<string>,
): string {
  return `${path.join('_')}__${version}__${name.join('_')}`;
}

export function columnIdFn(
  path: Array<string>,
): (version: string, ...name: Array<string>) => string {
  return (version: string, ...name: Array<string>) =>
    columnIdBase(name, version, path);
}
