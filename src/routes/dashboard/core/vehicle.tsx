import {
  type ActionType,
  type Key,
  ProForm,
  ProFormGroup,
  ProTable,
} from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { createFileRoute } from '@tanstack/react-router';
import { App, Button, Modal, Popconfirm } from 'antd';
import { useRef, useState } from 'react';
import GroupedEmbedSchemaForm from '@/components/GroupedEmbedSchemaForm.tsx';
import ProExport from '@/components/ProExport.tsx';
import ProImport from '@/components/ProImport.tsx';
import { Api, type ApiResult, DataApi } from '@/lib/api.ts';
import { columnIdFn } from '@/lib/functions.tsx';
import type { ColumnsType, VehicleDataVO } from '@/lib/types.ts';
import { companyInfoColumns } from '@/routes/dashboard/core/company/info.tsx';
import { employeeInfoColumns } from '@/routes/dashboard/core/employee/document.tsx';

export const Route = createFileRoute('/dashboard/core/vehicle')({
  component: RouteComponent,
});

const columnId = columnIdFn(['core', 'vehicle']);

const columns: ColumnsType[] = [
  {
    valueType: '$tabGroup',
    group: {
      id: 'basic',
      title: '基础档案',
    },
    columns: [
      {
        valueType: '$tabGroup',
        group: {
          id: 'basic',
          title: '基础信息',
        },
        columns: [
          {
            title: '车牌号',
            dataIndex: columnId('v1', 'basic', 'basic', 'plateNumber'),
            valueType: 'text',
            formItemProps: {
              rules: [{ required: true, message: '请输入车牌号' }],
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '驾驶员',
            dataIndex: columnId('v1', 'basic', 'basic', 'driver'),
            valueType: 'employee',
            colProps: {
              span: 12,
            },
          },
          {
            title: '状态',
            dataIndex: columnId('v1', 'basic', 'basic', 'status'),
            valueType: 'select',
            valueEnum: {
              inUse: '使用中',
              transferred: '已过户',
              scrapped: '已报废',
              suspended: '已停运',
            },
            colProps: {
              span: 12,
            },
          },
          {
            title: '备注',
            dataIndex: columnId('v1', 'basic', 'basic', 'remark'),
            valueType: 'textarea',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'vehicleRegistrationCertificate',
          title: '车辆登记证书',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleRegistrationCertificate',
              'file',
            ),
            valueType: '#assets',
            colProps: {
              span: 24,
            },
            fieldProps: {
              multiple: true,
              maxCount: 3,
              allowFileTypes: ['image/*'],
            },
          },
          {
            valueType: '$tabGroup',
            group: {
              id: 'basic',
              title: '基本信息',
            },
            columns: [
              {
                title: '机动车所有人/身份证明名称/号码',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'ownerIdInfo',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '登记机关',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'registrationAuthority',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '登记日期',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'registrationDate',
                ),
                valueType: 'date',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '机动车登记编号',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'registrationNumber',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '注册登记机动车信息',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'registrationVehicleInfo',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '车辆类型',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'vehicleType',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '车辆品牌',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'vehicleBrand',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '车辆型号',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'vehicleModel',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '车身颜色',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'bodyColor',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '车辆识别代号/车架号',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'vin',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '国产/进口',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'madeIn',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '发动机号',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'engineNumber',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '发动机型号',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'engineModel',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '燃料种类',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'fuelType',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '排量',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'displacement',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '功率',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'power',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '制造厂名称',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'manufacturer',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '转向形式',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'steeringType',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '轮距-前',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'frontWheelTrack',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '轮距-后',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'rearWheelTrack',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '轮胎数',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'tireCount',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '轮胎规格',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'tireSpecification',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '钢板弹簧片数',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'leafSpringCount',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '轴距',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'wheelbase',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '轴数',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'axleCount',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '外廓尺寸-长',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'overallLength',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '外廓尺寸-宽',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'overallWidth',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '外廓尺寸-高',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'overallHeight',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '货厢内部尺寸-长',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'cargoBoxLength',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '货厢内部尺寸-宽',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'cargoBoxWidth',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '货厢内部尺寸-高',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'cargoBoxHeight',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '总质量',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'totalMass',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '核定载质量',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'ratedLoadCapacity',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '核定载客',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'ratedPassengerCapacity',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '准牵引总质量',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'authorizedTowingMass',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '驾驶室载客',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'cabPassengerCapacity',
                ),
                valueType: 'digit',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '使用性质',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'usageNature',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '车辆获得方式',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'vehicleAcquisitionMethod',
                ),
                valueType: 'text',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '车辆出厂日期',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'manufactureDate',
                ),
                valueType: 'date',
                colProps: {
                  span: 12,
                },
              },
              {
                title: '发证日期',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'basic',
                  'issueDate',
                ),
                valueType: 'date',
                colProps: {
                  span: 12,
                },
              },
            ],
          },
          {
            valueType: '$tabGroup',
            group: {
              id: 'relocationSummary',
              title: '转移登记摘要',
            },
            columns: [
              {
                title: '转移登记摘要',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'relocationSummary',
                  'list',
                ),
                valueType: 'formList',
                fieldProps: {
                  itemContainerRender: (dom: any) => (
                    <ProFormGroup>{dom}</ProFormGroup>
                  ),
                  alwaysShowItemLabel: true,
                },
                columns: [
                  {
                    title: '机动车所有人/身份证明名称/号码',
                    dataIndex: 'ownerIdInfo',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '登记机关',
                    dataIndex: 'registrationAuthority',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '登记日期',
                    dataIndex: 'registrationDate',
                    valueType: 'date',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '机动车登记编号',
                    dataIndex: 'registrationNumber',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                ],
                colProps: {
                  span: 24,
                },
              },
            ],
          },
          {
            valueType: '$tabGroup',
            group: {
              id: 'mortgage',
              title: '抵押登记',
            },
            columns: [
              {
                title: '抵押登记',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'mortgage',
                  'list',
                ),
                valueType: 'formList',
                fieldProps: {
                  itemContainerRender: (dom: any) => (
                    <ProFormGroup>{dom}</ProFormGroup>
                  ),
                  alwaysShowItemLabel: true,
                },
                columns: [
                  {
                    title: '抵押权人姓名/名称',
                    dataIndex: 'ownerName',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '身份证明名称/号码',
                    dataIndex: 'ownerId',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '抵押登记日期',
                    dataIndex: 'date',
                    valueType: 'date',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '解除抵押日期',
                    dataIndex: 'releaseDate',
                    valueType: 'date',
                    colProps: {
                      span: 'auto',
                    },
                  },
                ],
                colProps: {
                  span: 24,
                },
              },
            ],
          },
          {
            valueType: '$tabGroup',
            group: {
              id: 'relocation',
              title: '转移登记',
            },
            columns: [
              {
                title: '转移登记',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'relocation',
                  'list',
                ),
                valueType: 'formList',
                fieldProps: {
                  itemContainerRender: (dom: any) => (
                    <ProFormGroup>{dom}</ProFormGroup>
                  ),
                  alwaysShowItemLabel: true,
                },
                columns: [
                  {
                    title: '姓名/名称',
                    dataIndex: 'ownerName',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '身份证明名称/号码',
                    dataIndex: 'ownerId',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '转移登记日期',
                    dataIndex: 'date',
                    valueType: 'date',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '获得方式',
                    dataIndex: 'acquisitionMethod',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '转入地车辆管理所名称',
                    dataIndex: 'transferInVehicleManagementOffice',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                ],
                colProps: {
                  span: 24,
                },
              },
            ],
          },
          {
            valueType: '$tabGroup',
            group: {
              id: 'transfer',
              title: '转让登记',
            },
            columns: [
              {
                title: '转让登记',
                dataIndex: columnId(
                  'v1',
                  'basic',
                  'vehicleRegistrationCertificate',
                  'transfer',
                  'list',
                ),
                valueType: 'formList',
                fieldProps: {
                  itemContainerRender: (dom: any) => (
                    <ProFormGroup>{dom}</ProFormGroup>
                  ),
                  alwaysShowItemLabel: true,
                },
                columns: [
                  {
                    title: '姓名/名称',
                    dataIndex: 'ownerName',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '身份证明名称/号码',
                    dataIndex: 'ownerId',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '转让登记日期',
                    dataIndex: 'date',
                    valueType: 'date',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '获得方式',
                    dataIndex: 'acquisitionMethod',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                  {
                    title: '机动车登记编号',
                    dataIndex: 'registrationNumber',
                    valueType: 'text',
                    colProps: {
                      span: 'auto',
                    },
                  },
                ],
                colProps: {
                  span: 24,
                },
              },
            ],
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'vehicleLicense',
          title: '车辆行驶证',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'file'),
            valueType: '#assets',
            colProps: {
              span: 24,
            },
            fieldProps: {
              multiple: true,
              maxCount: 3,
              allowFileTypes: ['image/*'],
            },
          },
          {
            title: '号牌号码',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'licensePlateNumber',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '车辆类型',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'vehicleType'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '所有人',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'owner'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '住址',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'address'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '使用性质',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'usageNature'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '品牌型号',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'brandModel'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '车辆识别代号',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'vin'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '发动机号码',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'engineNumber',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '注册日期',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'registrationDate',
            ),
            valueType: 'date',
            colProps: {
              span: 12,
            },
          },
          {
            title: '发证日期',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'issueDate'),
            valueType: 'date',
            colProps: {
              span: 12,
            },
          },
          {
            title: '档案编号',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'fileNumber'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '核定载人数',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'ratedPassengerCapacity',
            ),
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '总质量',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'totalMass'),
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '整备质量',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'curbWeight'),
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '核定载质量',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'ratedLoadCapacity',
            ),
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '外廓尺寸-长',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'overallLength',
            ),
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '外廓尺寸-宽',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'overallWidth',
            ),
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '外廓尺寸-高',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'overallHeight',
            ),
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '准牵引总质量',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'authorizedTowingMass',
            ),
            valueType: 'digit',
            colProps: {
              span: 12,
            },
          },
          {
            title: '备注',
            dataIndex: columnId('v1', 'basic', 'vehicleLicense', 'remarks'),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '强制报废期止',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'mandatoryScrapDate',
            ),
            valueType: 'date',
            colProps: {
              span: 12,
            },
          },
          {
            title: '检验有效期至',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'inspectionExpiryDate',
            ),
            valueType: 'date',
            colProps: {
              span: 12,
            },
          },
          {
            title: '检验记录',
            dataIndex: columnId(
              'v1',
              'basic',
              'vehicleLicense',
              'inspectionRecords',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'roadTransportPermit',
          title: '道路运输证',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'roadTransportPermit', 'file'),
            valueType: '#assets',
            colProps: {
              span: 24,
            },
            fieldProps: {
              multiple: true,
              maxCount: 3,
              allowFileTypes: ['image/*'],
            },
          },
          {
            title: '业户名称',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'businessName',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '地址',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'address',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '车牌号码',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'licensePlateNumber',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '经营许可证号',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'licenseNumber',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '车辆类型',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'vehicleType',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '吨（座）位',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'tonnageSeats',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '经营范围',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'businessScope',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '车辆尺寸',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'vehicleDimensions',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '发证日期',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'issueDate',
            ),
            valueType: 'date',
            colProps: {
              span: 12,
            },
          },
          {
            title: '有效期至',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'validUntil',
            ),
            valueType: 'date',
            colProps: {
              span: 12,
            },
          },
          {
            title: '核发机关',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'issuingAuthority',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '审验有效期至',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'inspectionValidUntil',
            ),
            valueType: 'date',
            colProps: {
              span: 12,
            },
          },
          {
            title: '技术等级评定',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'technicalGrade',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
          {
            title: '备注',
            dataIndex: columnId(
              'v1',
              'basic',
              'roadTransportPermit',
              'remarks',
            ),
            valueType: 'text',
            colProps: {
              span: 12,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'insurance',
          title: '保险信息',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'insurance', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
            fieldProps: {
              multiple: true,
              allowFileTypes: ['image/*', 'application/pdf'],
            },
          },
          {
            title: '保险信息',
            dataIndex: columnId('v1', 'basic', 'insurance', 'list'),
            valueType: 'formList',
            fieldProps: {
              itemContainerRender: (dom: any) => (
                <ProFormGroup>{dom}</ProFormGroup>
              ),
              alwaysShowItemLabel: true,
            },
            columns: [
              {
                title: '保险公司',
                dataIndex: 'insuranceCompany',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '承保险种',
                dataIndex: 'insuranceType',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '金额',
                dataIndex: 'amount',
                valueType: 'money',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '保险期间',
                dataIndex: 'insurancePeriod',
                valueType: 'dateTimeRange',
                colProps: {
                  span: 'auto',
                },
              },
            ],
            colProps: {
              span: 24,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'other',
          title: '其它文件',
        },
        columns: [
          {
            title: '文件',
            dataIndex: columnId('v1', 'basic', 'other', 'file'),
            valueType: '#assets',
            colProps: {
              span: 12,
            },
            fieldProps: {
              multiple: true,
              allowFileTypes: ['image/*'],
            },
          },
        ],
      },
    ],
  },
  {
    valueType: '$tabGroup',
    group: {
      id: 'other',
      title: '其它档案',
    },
    columns: [
      {
        valueType: '$tabGroup',
        group: {
          id: 'inspectionAndEvaluationRecord',
          title: '检查和评定登记表',
        },
        columns: [
          {
            title: '检查和评定登记表',
            dataIndex: columnId(
              'v1',
              'other',
              'inspectionAndEvaluationRecord',
              'list',
            ),
            valueType: 'formList',
            fieldProps: {
              itemContainerRender: (dom: any) => (
                <ProFormGroup>{dom}</ProFormGroup>
              ),
              alwaysShowItemLabel: true,
            },
            columns: [
              {
                title: '检测/评定日期',
                dataIndex: 'inspectionDate',
                valueType: 'date',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '检测/评定类别',
                dataIndex: 'inspectionType',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '检测/评定单位',
                dataIndex: 'inspectionUnit',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '行驶里程',
                dataIndex: 'mileage',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '报告编号',
                dataIndex: 'reportNumber',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '备注',
                dataIndex: 'remarks',
                colProps: {
                  span: 'auto',
                },
              },
            ],
            colProps: {
              span: 24,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'maintenanceAndRepairRecord',
          title: '维护和修理登记表',
        },
        columns: [
          {
            title: '维护和修理登记表',
            dataIndex: columnId(
              'v1',
              'other',
              'maintenanceAndRepairRecord',
              'list',
            ),
            valueType: 'formList',
            fieldProps: {
              itemContainerRender: (dom: any) => (
                <ProFormGroup>{dom}</ProFormGroup>
              ),
              alwaysShowItemLabel: true,
            },
            columns: [
              {
                title: '维修日期',
                dataIndex: 'repairDate',
                valueType: 'date',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '累计行驶里程(KM)',
                dataIndex: 'mileage',
                valueType: 'digit',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '维修类别',
                dataIndex: 'repairType',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '修理内容',
                dataIndex: 'repairContent',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '维修单位',
                dataIndex: 'repairUnit',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '合格证编号',
                dataIndex: 'certificateNumber',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
            ],
            colProps: {
              span: 24,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'majorComponentReplacementRecord',
          title: '主要部件更换登记表',
        },
        columns: [
          {
            title: '主要部件更换登记表',
            dataIndex: columnId(
              'v1',
              'other',
              'majorComponentReplacementRecord',
              'list',
            ),
            valueType: 'formList',
            fieldProps: {
              itemContainerRender: (dom: any) => (
                <ProFormGroup>{dom}</ProFormGroup>
              ),
              alwaysShowItemLabel: true,
            },
            columns: [
              {
                title: '更换日期',
                dataIndex: 'replacementDate',
                valueType: 'date',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '部件名称',
                dataIndex: 'partName',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '型号规格',
                dataIndex: 'modelSpecification',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '生产厂名称',
                dataIndex: 'manufacturer',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '部件编码',
                dataIndex: 'partCode',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '维修单位',
                dataIndex: 'repairUnit',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
            ],
            colProps: {
              span: 24,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'changeRecord',
          title: '变更登记表',
        },
        columns: [
          {
            title: '变更登记表',
            dataIndex: columnId('v1', 'other', 'changeRecord', 'list'),
            valueType: 'formList',
            fieldProps: {
              itemContainerRender: (dom: any) => (
                <ProFormGroup>{dom}</ProFormGroup>
              ),
              alwaysShowItemLabel: true,
            },
            columns: [
              {
                title: '变更日期',
                dataIndex: 'changeDate',
                valueType: 'date',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '变更原因',
                dataIndex: 'changeReason',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '变更事项',
                dataIndex: 'changeItem',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
            ],
            colProps: {
              span: 24,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'mileageRecord',
          title: '行驶里程登记表',
        },
        columns: [
          {
            title: '行驶里程登记表',
            dataIndex: columnId('v1', 'other', 'mileageRecord', 'list'),
            valueType: 'formList',
            fieldProps: {
              itemContainerRender: (dom: any) => (
                <ProFormGroup>{dom}</ProFormGroup>
              ),
              alwaysShowItemLabel: true,
            },
            columns: [
              {
                title: '登记日期',
                dataIndex: 'registrationDate',
                valueType: 'date',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '当月行驶里程(km)',
                dataIndex: 'monthlyMileage',
                valueType: 'digit',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '累计行驶里程(km)',
                dataIndex: 'totalMileage',
                valueType: 'digit',
                colProps: {
                  span: 'auto',
                },
              },
            ],
            colProps: {
              span: 24,
            },
          },
        ],
      },
      {
        valueType: '$tabGroup',
        group: {
          id: 'mechanicalDamageAccidentRecord',
          title: '机损事故登记表',
        },
        columns: [
          {
            title: '机损事故登记表',
            dataIndex: columnId(
              'v1',
              'other',
              'mechanicalDamageAccidentRecord',
              'list',
            ),
            valueType: 'formList',
            fieldProps: {
              itemContainerRender: (dom: any) => (
                <ProFormGroup>{dom}</ProFormGroup>
              ),
              alwaysShowItemLabel: true,
            },
            columns: [
              {
                title: '事故时间',
                dataIndex: 'accidentTime',
                valueType: 'dateTime',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '事故地点',
                dataIndex: 'accidentLocation',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '事故性质',
                dataIndex: 'accidentNature',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '事故责任',
                dataIndex: 'accidentResponsibility',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
              {
                title: '车辆损坏情况',
                dataIndex: 'vehicleDamage',
                valueType: 'text',
                colProps: {
                  span: 'auto',
                },
              },
            ],
            colProps: {
              span: 24,
            },
          },
        ],
      },
    ],
  },
];

function RouteComponent() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(undefined);
  const [vehicle, setVehicle] = useState<
    { id?: string; data?: Record<string, any> } | undefined
  >(undefined);
  const [selectedRows, setSelectedRows] = useState<Key[]>([]);

  return (
    <div>
      <Modal
        open={!!vehicle}
        title="编辑"
        destroyOnHidden
        footer={null}
        width="80vw"
        onCancel={() => {
          setVehicle(undefined);
        }}
      >
        <ProForm
          grid
          initialValues={vehicle?.data ?? {}}
          onFinish={async (values) => {
            const plateNumber =
              values[columnId('v1', 'basic', 'basic', 'plateNumber')];
            if (!plateNumber) {
              return false;
            }

            delete values[columnId('v1', 'basic', 'basic', 'plateNumber')];

            let resp: ApiResult;

            if (vehicle?.id) {
              resp = await Api.dashboard.core.vehicle.update(
                vehicle.id,
                plateNumber,
                values,
              );
            } else {
              resp = await Api.dashboard.core.vehicle.create(
                plateNumber,
                values,
              );
            }

            if (resp.code === 200) {
              message.success('保存成功');
              actionRef.current?.reload();
              // form.setFieldsValue({});
              setVehicle(undefined);
              return true;
            } else {
              message.error(`保存失败: ${resp.msg}`);
              console.error(resp);
              return false;
            }
          }}
        >
          <div className="pb-6 grow">
            <GroupedEmbedSchemaForm columns={columns} />
          </div>
        </ProForm>
      </Modal>
      <ProTable
        actionRef={actionRef}
        request={Api.dashboard.core.vehicle.list}
        rowSelection={{
          type: 'checkbox',
          onChange: (selectedRowKeys) => {
            setSelectedRows(selectedRowKeys);
          },
          selectedRowKeys: selectedRows,
        }}
        rowKey="id"
        toolBarRender={() => [
          <Button
            key="add"
            icon={<Icon icon="lucide:plus" />}
            onClick={() => {
              setVehicle({});
            }}
          >
            添加
          </Button>,
          <ProImport
            title="车辆档案"
            columns={columns}
            onImport={async (rows) => {
              const counts = {
                success: 0,
                failure: 0,
              };
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (row?.[columnId('v1', 'basic', 'basic', 'plateNumber')]) {
                  const plateNumber =
                    row[columnId('v1', 'basic', 'basic', 'plateNumber')];

                  const data = row;
                  delete data[columnId('v1', 'basic', 'basic', 'plateNumber')];

                  const resp = await Api.dashboard.core.vehicle.create(
                    plateNumber,
                    data,
                  );

                  if (resp.code === 200) {
                    counts.success++;
                  } else {
                    counts.failure++;
                  }
                }
              }
              return counts;
            }}
            afterImport={() => {
              actionRef.current?.reload();
            }}
          />,
          <ProExport
            key="export"
            columns={[
              ...companyInfoColumns,
              ...employeeInfoColumns,
              ...columns,
            ]}
            identifier="core.vehicle"
            keys={(selectedRows?.length ?? 0) === 0 ? [] : selectedRows}
            fetchAllIds={async () => {
              const resp = await Api.dashboard.core.vehicle.getIds();
              return resp.data ?? [];
            }}
            fetchData={async (key) => {
              const resp = await Api.dashboard.core.vehicle.get(`${key}`);
              let data: VehicleDataVO | any | undefined = resp.data;

              if (data) {
                data = {
                  ...data,
                  ...data.data,
                };
                delete data.data;

                if (data?.[columnId('v1', 'basic', 'basic', 'driver')]) {
                  const employee =
                    await DataApi.dashboard.core.employee.document(
                      data[columnId('v1', 'basic', 'basic', 'driver')],
                    );
                  data = {
                    ...data,
                    ...employee,
                  };
                }
              }

              return data;
            }}
            extraData={async () => {
              const companyInfo = await DataApi.dashboard.core.company.info();

              return {
                ...companyInfo,
              };
            }}
          />,
        ]}
        columns={[
          {
            title: 'ID',
            dataIndex: 'id',
            hidden: true,
            hideInSearch: true,
            search: false,
          },
          {
            title: '车牌号',
            dataIndex: 'plateNumber',
            valueType: 'text',
            formItemProps: {
              rules: [{ required: true, message: '请输入车牌号' }],
            },
          },
          {
            title: '驾驶员',
            dataIndex: 'driver',
            valueType: 'employee',
          },
          {
            title: '机动车所有人',
            dataIndex: 'owner',
            valueType: 'text',
          },
          {
            title: '车辆类型',
            dataIndex: 'vehicleType',
            valueType: 'text',
          },
          {
            title: '状态',
            dataIndex: 'status',
            valueType: 'select',
            valueEnum: {
              inUse: '使用中',
              transferred: '已过户',
              scrapped: '已报废',
              suspended: '已停运',
            },
          },
          {
            title: '操作',
            valueType: 'option',
            render: (_, record) => (
              <>
                <Button
                  type="link"
                  size="small"
                  onClick={async () => {
                    const loading = message.loading(`加载中...`, 0);

                    const resp = await Api.dashboard.core.vehicle.get(
                      record.id,
                    );

                    loading();

                    if (resp.code === 200 && resp.data) {
                      setVehicle({
                        id: record.id,
                        data: {
                          ...resp.data.data,
                          [columnId('v1', 'basic', 'basic', 'plateNumber')]:
                            resp.data.plateNumber,
                        },
                      });
                    } else {
                      message.error(`加载失败: ${resp.msg}`);
                      console.error(resp);
                    }
                  }}
                >
                  编辑
                </Button>
                <Popconfirm
                  title={`确定删除${record.plateNumber}？`}
                  onConfirm={async () => {
                    const resp = await Api.dashboard.core.vehicle.delete(
                      record.id,
                    );
                    if (resp.code === 200) {
                      message.success('删除成功');
                      actionRef.current?.reload();
                    } else {
                      message.error(`删除失败: ${resp.msg}`);
                      console.error(resp);
                    }
                  }}
                  okText="删除"
                  okButtonProps={{
                    danger: true,
                  }}
                >
                  <Button type="link" size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
